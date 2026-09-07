import { maskPII } from './pii-masker';
import { groqChat, GroqMessage } from './groq';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIOptions {
  temperature?: number;
  max_tokens?: number;
  model?: string;
  json?: boolean;
}

// Modelos do Cloudflare Workers AI
export const CF_MODELS = {
  REASONING: '@cf/meta/llama-3.3-70b-instruct',
  FAST:      '@cf/meta/llama-3.1-8b-instruct',
  VISION:    '@cf/meta/llama-3.2-11b-vision-instruct',
};

/**
 * Executa inferência de texto utilizando Cloudflare Workers AI com fallback automático para Groq.
 * Aplica anonimização e mascaramento de PII (CPF, CNPJ, cartões, contas) previamente.
 */
export async function executeTextAI(
  c: any,
  messages: AIMessage[],
  opts: AIOptions = {},
): Promise<string> {
  const sanitizedMessages = messages.map(m => ({
    role: m.role,
    content: maskPII(m.content),
  }));

  // Se o usuário especificou chave própria do Groq via header, honra a preferência
  const userGroqKey = c.req?.header ? (c.req.header('X-Groq-Api-Key') ?? '') : '';
  if (userGroqKey && userGroqKey.startsWith('gsk_')) {
    const groqMessages: GroqMessage[] = sanitizedMessages.map(m => ({ role: m.role, content: m.content }));
    return await groqChat(userGroqKey, 'llama-3.3-70b-versatile', groqMessages, {
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 2048,
      response_format: opts.json ? { type: 'json_object' } : undefined,
    });
  }

  // 1. Tentar Cloudflare Workers AI se o binding estiver disponível
  if (c.env?.AI && typeof c.env.AI.run === 'function') {
    const model = opts.model || (opts.max_tokens && opts.max_tokens > 2000 ? CF_MODELS.REASONING : CF_MODELS.FAST);
    try {
      const aiInput: Record<string, unknown> = {
        messages: sanitizedMessages,
        max_tokens: opts.max_tokens ?? 2048,
        temperature: opts.temperature ?? 0.2,
      };

      const result = await c.env.AI.run(model, aiInput) as any;
      if (result && typeof result.response === 'string' && result.response.trim().length > 0) {
        return result.response;
      }
    } catch (cfErr: any) {
      console.warn(`[Workers AI] Erro no modelo ${model}, tentando fallback:`, cfErr?.message || cfErr);
      // Prossegue para fallback Groq abaixo
    }
  }

  // 2. Fallback para Groq se configurado
  const groqEnvKey = c.env?.GROQ_API_KEY;
  if (groqEnvKey) {
    const groqMessages: GroqMessage[] = sanitizedMessages.map(m => ({ role: m.role, content: m.content }));
    return await groqChat(groqEnvKey, 'llama-3.3-70b-versatile', groqMessages, {
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 2048,
      response_format: opts.json ? { type: 'json_object' } : undefined,
    });
  }

  throw new Error('Nenhum motor de IA disponível (Cloudflare Workers AI ou GROQ_API_KEY não configurados).');
}

/**
 * Executa OCR / Visão computacional utilizando Cloudflare Workers AI com fallback para Groq Vision.
 */
export async function executeVisionAI(
  c: any,
  prompt: string,
  base64Image: string,
  mimeType: string,
  opts: AIOptions = {},
): Promise<string> {
  const sanitizedPrompt = maskPII(prompt);

  // 1. Tentar Cloudflare Workers AI com Llama 3.2 Vision
  if (c.env?.AI && typeof c.env.AI.run === 'function') {
    try {
      // Converte base64 para array de bytes
      const binaryString = atob(base64Image);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const aiInput = {
        prompt: sanitizedPrompt,
        image: [...bytes], // Array de números esperado pelo binding do Workers AI
        max_tokens: opts.max_tokens ?? 2048,
      };

      const result = await c.env.AI.run(CF_MODELS.VISION, aiInput) as any;
      if (result && typeof result.response === 'string' && result.response.trim().length > 0) {
        return result.response;
      }
    } catch (cfErr: any) {
      console.warn('[Workers AI Vision] Falha no Llama Vision, tentando fallback:', cfErr?.message || cfErr);
    }
  }

  // 2. Fallback para Groq Vision
  const groqKey = (c.req?.header ? c.req.header('X-Groq-Api-Key') : null) || c.env?.GROQ_API_KEY;
  if (groqKey) {
    return await groqChat(
      groqKey,
      'meta-llama/llama-4-scout-17b-16e-instruct',
      [{
        role: 'user',
        content: [
          { type: 'text', text: sanitizedPrompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ],
      }],
      { temperature: opts.temperature ?? 0.1, max_tokens: opts.max_tokens ?? 2048 },
    );
  }

  throw new Error('Nenhum serviço de visão computacional disponível.');
}

/**
 * Extrai e converte JSON com segurança a partir da resposta de um modelo LLM.
 */
export function extractAndParseJSON<T = Record<string, unknown>>(raw: string, fallback?: T): T {
  if (!raw || typeof raw !== 'string') {
    if (fallback !== undefined) return fallback;
    throw new Error('Resposta vazia do modelo de IA.');
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Tenta extrair bloco {...} ou [...]
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch { /* continua */ }
    }

    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]) as T;
      } catch { /* continua */ }
    }

    if (fallback !== undefined) return fallback;
    throw new Error(`Não foi possível interpretar a resposta da IA como JSON: ${raw.slice(0, 100)}...`);
  }
}

export const safeExtractJSON = extractAndParseJSON;

