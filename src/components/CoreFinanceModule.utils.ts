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

/**
 * Parseia valor monetário BR/US para reais (não centavos).
 * Aceita negativo: "-1.234,56", "-500", "(500,00)".
 * Retorna NaN se inválido.
 */
export function parseMoneyToReais(raw: string): number {
  let s = String(raw ?? '').trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1).trim();
  }
  s = s.replace(/[R$\s]/gi, '');
  // BR: 1.234,56 → remove milhares, vírgula → ponto
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return neg ? -Math.abs(n) : n;
}

/** Converte string monetária para centavos (inteiro). NaN se inválido. */
export function parseMoneyToCents(raw: string): number {
  const reais = parseMoneyToReais(raw);
  if (isNaN(reais)) return NaN;
  return Math.round(reais * 100);
}

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
