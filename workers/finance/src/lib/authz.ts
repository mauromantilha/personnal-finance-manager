import type { Context, Next } from 'hono';
import type { Env, Variables } from '../index';

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

/** Middleware: apenas role owner. */
export async function requireOwner(c: AppContext, next: Next) {
  const user = c.get('user');
  if (!user || user.role !== 'owner') {
    return c.json(
      { error: 'Apenas o owner pode realizar esta ação.', code: 'OWNER_REQUIRED' },
      403,
    );
  }
  return next();
}

export function isOwner(user: { role?: string } | null | undefined): boolean {
  return user?.role === 'owner';
}

/**
 * Sanitiza histórico de chat enviado pelo cliente.
 * Aceita apenas role user|assistant; rejeita system/tool (prompt injection).
 */
export function sanitizeChatHistory(
  history: unknown,
  opts: { maxMessages?: number; maxContentLen?: number } = {},
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const maxMessages = opts.maxMessages ?? 12;
  const maxContentLen = opts.maxContentLen ?? 4000;
  if (!Array.isArray(history)) return [];

  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const item of history.slice(-maxMessages)) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;
    const trimmed = content.trim().slice(0, maxContentLen);
    if (!trimmed) continue;
    out.push({ role, content: trimmed });
  }
  return out;
}
