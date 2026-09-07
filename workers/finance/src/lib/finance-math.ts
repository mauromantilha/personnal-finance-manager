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

/**
 * Adiciona N meses a uma data (YYYY-MM-DD ou Date), garantindo que o dia do mês
 * não estoure o último dia do mês de destino (ex: 31/01 + 1 mês -> 28/02).
 */
export function addMonthsSafe(dateInput: string | Date, monthsToAdd: number): string {
  let year: number;
  let month: number; // 0-indexed (0 = Jan, 11 = Dec)
  let day: number;

  if (typeof dateInput === 'string') {
    const parts = dateInput.split('T')[0].split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  } else {
    year = dateInput.getFullYear();
    month = dateInput.getMonth();
    day = dateInput.getDate();
  }

  const totalMonths = month + monthsToAdd;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;

  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const safeDay = Math.min(day, daysInTargetMonth);

  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

/**
 * Divide um montante em centavos em N parcelas inteiras sem perda de centavos.
 * A sobra (resto da divisão) é alocada na primeira parcela (padrão do mercado BR).
 */
export function splitCentsWithRemainder(totalCents: number, count: number): number[] {
  if (count <= 0) return [totalCents];
  if (count === 1) return [totalCents];

  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;

  const installments: number[] = [];
  for (let i = 0; i < count; i++) {
    installments.push(i === 0 ? base + remainder : base);
  }
  return installments;
}

/**
 * Determina a fatura de cartão de crédito (mês de referência e vencimento)
 * de acordo com as regras de fechamento e vencimento:
 * - Se o dia da compra for menor que o dia de fechamento (billingDay), cai no ciclo do mês da compra.
 * - Se o dia da compra for maior ou igual ao dia de fechamento, cai no próximo ciclo de fechamento.
 * - O vencimento (dueDay) ocorre no mesmo mês do fechamento se dueDay > billingDay,
 *   ou no mês subsequente se dueDay <= billingDay.
 * - O invoiceMonth (YYYY-MM) representa o mês de vencimento da fatura.
 */
export function computeInvoiceCycle(
  txDateInput: string | Date,
  billingDay: number,
  dueDay: number,
): { invoiceMonth: string; dueDate: string } {
  let txYear: number;
  let txMonth: number; // 0-indexed
  let txDay: number;

  if (typeof txDateInput === 'string') {
    const parts = txDateInput.split('T')[0].split('-');
    txYear = parseInt(parts[0], 10);
    txMonth = parseInt(parts[1], 10) - 1;
    txDay = parseInt(parts[2], 10);
  } else {
    txYear = txDateInput.getFullYear();
    txMonth = txDateInput.getMonth();
    txDay = txDateInput.getDate();
  }

  const safeBillingDay = Math.min(Math.max(1, billingDay || 1), 31);
  const safeDueDay = Math.min(Math.max(1, dueDay || 10), 31);

  // 1. Determina o ciclo de fechamento
  const closeOffset = txDay >= safeBillingDay ? 1 : 0;
  const closeTotalMonths = txMonth + closeOffset;
  const closeYear = txYear + Math.floor(closeTotalMonths / 12);
  const closeMonth = ((closeTotalMonths % 12) + 12) % 12;

  // 2. Determina o mês de vencimento da fatura
  const dueOffset = safeDueDay > safeBillingDay ? 0 : 1;
  const dueTotalMonths = closeMonth + dueOffset;
  const dueYear = closeYear + Math.floor(dueTotalMonths / 12);
  const dueMonth = ((dueTotalMonths % 12) + 12) % 12;

  // 3. Clamping do dia de vencimento para evitar dias inexistentes (ex: 30 de fev)
  const daysInDueMonth = new Date(dueYear, dueMonth + 1, 0).getDate();
  const finalDueDay = Math.min(safeDueDay, daysInDueMonth);

  const invoiceMonth = `${dueYear}-${String(dueMonth + 1).padStart(2, '0')}`;
  const dueDate = `${invoiceMonth}-${String(finalDueDay).padStart(2, '0')}`;

  return { invoiceMonth, dueDate };
}
