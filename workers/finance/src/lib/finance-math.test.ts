import { describe, it, expect } from 'vitest';
import { brl, monthPrefix, sumBalance, sumByType } from './finance-math';

describe('brl', () => {
  it('formata centavos como moeda BR', () => {
    expect(brl(0)).toBe('R$ 0,00');
    expect(brl(100)).toBe('R$ 1,00');
    expect(brl(123456)).toBe('R$ 1.234,56');
  });
  it('lida com valores negativos', () => {
    expect(brl(-5000)).toBe('R$ -50,00');
  });
});

describe('monthPrefix', () => {
  it('retorna YYYY-MM com zero à esquerda', () => {
    expect(monthPrefix(new Date('2026-01-15T12:00:00'))).toBe('2026-01');
    expect(monthPrefix(new Date('2026-11-01T00:00:00'))).toBe('2026-11');
  });
});

describe('sumBalance', () => {
  it('soma saldos em centavos', () => {
    expect(sumBalance([])).toBe(0);
    expect(sumBalance([{ balanceInCents: 100 }, { balanceInCents: 250 }])).toBe(350);
  });
  it('soma saldos negativos corretamente', () => {
    expect(sumBalance([{ balanceInCents: 500 }, { balanceInCents: -200 }])).toBe(300);
  });
});

describe('sumByType', () => {
  const txs = [
    { type: 'REC', amountInCents: 1000 },
    { type: 'DES', amountInCents: 300 },
    { type: 'REC', amountInCents: 500 },
    { type: 'TRANS', amountInCents: 9999 },
  ];
  it('soma apenas o tipo pedido', () => {
    expect(sumByType(txs, 'REC')).toBe(1500);
    expect(sumByType(txs, 'DES')).toBe(300);
  });
  it('retorna 0 quando não há transações do tipo', () => {
    expect(sumByType([], 'REC')).toBe(0);
  });
});
