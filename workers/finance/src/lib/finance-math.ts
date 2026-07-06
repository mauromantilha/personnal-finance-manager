// Helpers puros de agregação/formatação financeira — compartilhados pelas rotas
// de IA (advisor, predictive, financial-chat, agent-chat), que antes repetiam
// estes mesmos reduces/formatação em cada handler.

/** Formata centavos como moeda brasileira (R$ 1.234,56). */
export const brl = (cents: number): string =>
  `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

/** Prefixo de mês YYYY-MM para a data informada (default: agora). */
export const monthPrefix = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Soma de saldos (patrimônio líquido) em centavos. */
export const sumBalance = (accounts: { balanceInCents: number }[]): number =>
  accounts.reduce((s, a) => s + a.balanceInCents, 0);

/** Soma de transações de um tipo ('REC' | 'DES') em centavos. */
export const sumByType = (
  txs: { type: string; amountInCents: number }[],
  type: 'REC' | 'DES',
): number => txs.filter(t => t.type === type).reduce((s, t) => s + t.amountInCents, 0);
