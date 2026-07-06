// Helpers puros extraídos de CoreFinanceModule.tsx (god component). Sem estado,
// sem React — funções testáveis e reutilizáveis. Comportamento idêntico ao
// código inline original.

export type PeriodFilter = 'this_month' | 'last_month' | '30d' | '90d' | 'all';

export const FALLBACK_CATS = [
  'Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde',
  'Educação', 'Receita', 'Investimentos', 'Outros',
];

export const formatBRL = (cents: number): string =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface CsvPreviewRow { date: string; desc: string; amount: string; }

/** Parseia as primeiras 5 linhas não-cabeçalho de um CSV colado (preview). */
export function parseCsvPreview(csvText: string): CsvPreviewRow[] {
  if (!csvText) return [];
  return csvText.split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => !/^(data|date|dia)/i.test(l))
    .slice(0, 5)
    .map(line => {
      const cols = line.replace(/^﻿/, '').split(/[,;]/).map(c => c.trim().replace(/^"|"$/g, ''));
      return { date: cols[0] || '', desc: cols[1] || '', amount: cols[2] || '' };
    });
}

export interface PeriodBounds { from: string; to: string; }

/** Calcula os limites de data (inclusive) para o filtro de período do extrato. */
export function computePeriodBounds(period: PeriodFilter, now: Date = new Date()): PeriodBounds {
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');

  if (period === 'this_month') {
    return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-31` };
  }
  if (period === 'last_month') {
    const lm = m === 0 ? 12 : m;
    const ly = m === 0 ? y - 1 : y;
    return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-31` };
  }
  if (period === '30d') {
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    return { from: d30.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
  }
  if (period === '90d') {
    const d90 = new Date(now); d90.setDate(d90.getDate() - 90);
    return { from: d90.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
  }
  return { from: '', to: '' };
}
