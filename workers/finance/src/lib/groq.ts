// Groq API — fetch-based (Workers compatible, sem SDK Node.js)

const GROQ_BASE = 'https://api.groq.com/openai/v1';

export type GroqMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | unknown[];
};

interface GroqOpts {
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
}

export async function groqChat(
  apiKey: string,
  model: string,
  messages: GroqMessage[],
  opts: GroqOpts = {},
): Promise<string> {
  const resp = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, ...opts }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}

// Classificador local de estabelecimentos (fallback sem IA)
export function classifyMerchant(desc: string): string {
  const l = desc.toLowerCase();
  if (/mercado|supermercado|padaria|burger|restaurante|lanche|ifood|rappi|pizza|aliment|açougue|hortifruti/.test(l)) return 'Alimentação';
  if (/uber|99taxi|taxi|posto|combustiv|gasolina|estacion|onibus|metro|transporte|pedágio/.test(l)) return 'Transporte';
  if (/aluguel|imovel|condomin|agua|luz|energia|internet|telefone|gas|claro|vivo|tim|oi/.test(l)) return 'Moradia';
  if (/netflix|cinema|spotify|ingresso|streaming|lazer|viagem|hotel|airbnb|booking/.test(l)) return 'Lazer';
  if (/farmacia|drogaria|saude|medico|clinica|plano|hospital|dentist|unimed|amil/.test(l)) return 'Saúde';
  if (/livro|curso|escola|facul|inglês|ingles|idioma|educacao|udemy|alura/.test(l)) return 'Educação';
  if (/roupa|vestuário|moda|fashion|zara|renner|hering|centauro|academia|gym/.test(l)) return 'Vestuário';
  if (/salario|salário|pagamento|renda|freelance|pix recebido|transferencia recebida/.test(l)) return 'Receita';
  return 'Outros';
}
