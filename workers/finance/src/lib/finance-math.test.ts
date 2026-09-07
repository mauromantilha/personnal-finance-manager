import { describe, it, expect } from 'vitest';
import {
  brl,
  monthPrefix,
  sumBalance,
  sumByType,
  addMonthsSafe,
  splitCentsWithRemainder,
  computeInvoiceCycle,
} from './finance-math';

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

describe('addMonthsSafe', () => {
  it('avança meses mantendo o dia quando seguro', () => {
    expect(addMonthsSafe('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonthsSafe('2026-01-15', 2)).toBe('2026-03-15');
  });

  it('evita pulo de mês ao avançar de dia 31 para mês com 28 ou 30 dias', () => {
    // 31 de janeiro + 1 mês em 2026 (não bissexto) deve ser 28 de fevereiro, e NÃO 3 de março
    expect(addMonthsSafe('2026-01-31', 1)).toBe('2026-02-28');
    // 31 de janeiro + 2 meses deve ser 31 de março
    expect(addMonthsSafe('2026-01-31', 2)).toBe('2026-03-31');
    // 31 de janeiro + 3 meses deve ser 30 de abril
    expect(addMonthsSafe('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('gerencia virada de ano corretamente', () => {
    expect(addMonthsSafe('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsSafe('2026-12-31', 2)).toBe('2027-02-28');
  });
});

describe('splitCentsWithRemainder', () => {
  it('divide valor exato sem sobra', () => {
    expect(splitCentsWithRemainder(900, 3)).toEqual([300, 300, 300]);
  });

  it('distribui resto de divisão na primeira parcela preservando soma exata', () => {
    // R$ 10,00 em 3x (1000 centavos) -> 334, 333, 333. Soma = 1000.
    const parts = splitCentsWithRemainder(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);

    // R$ 100,00 em 3x (10000 centavos) -> 3334, 3333, 3333. Soma = 10000.
    const parts100 = splitCentsWithRemainder(10000, 3);
    expect(parts100).toEqual([3334, 3333, 3333]);
    expect(parts100.reduce((a, b) => a + b, 0)).toBe(10000);

    // R$ 100,00 em 7x (10000 centavos) -> 1428 * 7 = 9996 -> sobra 4
    const parts7 = splitCentsWithRemainder(10000, 7);
    expect(parts7.length).toBe(7);
    expect(parts7[0]).toBe(1428 + 4);
    expect(parts7.reduce((a, b) => a + b, 0)).toBe(10000);
  });
});

describe('computeInvoiceCycle', () => {
  it('aloca na fatura atual quando compra antes do fechamento (dueDay > billingDay)', () => {
    // Fechamento 12, Vencimento 19. Compra dia 5/março -> Fatura 2026-03, Venc 2026-03-19
    const res = computeInvoiceCycle('2026-03-05', 12, 19);
    expect(res.invoiceMonth).toBe('2026-03');
    expect(res.dueDate).toBe('2026-03-19');
  });

  it('aloca na próxima fatura quando compra no dia do fechamento ou depois (melhor dia de compra)', () => {
    // Fechamento 12, Vencimento 19. Compra dia 12/março -> Fatura 2026-04, Venc 2026-04-19
    const resClosingDay = computeInvoiceCycle('2026-03-12', 12, 19);
    expect(resClosingDay.invoiceMonth).toBe('2026-04');
    expect(resClosingDay.dueDate).toBe('2026-04-19');

    const resAfterClosing = computeInvoiceCycle('2026-03-25', 12, 19);
    expect(resAfterClosing.invoiceMonth).toBe('2026-04');
    expect(resAfterClosing.dueDate).toBe('2026-04-19');
  });

  it('trata cartões com vencimento no mês subsequente ao fechamento (dueDay <= billingDay)', () => {
    // Fechamento 25, Vencimento 5 (do mês seguinte)
    // Compra 10/março (< 25): fecha em 25/março, vence 05/abril -> Fatura 2026-04
    const resBefore = computeInvoiceCycle('2026-03-10', 25, 5);
    expect(resBefore.invoiceMonth).toBe('2026-04');
    expect(resBefore.dueDate).toBe('2026-04-05');

    // Compra 26/março (>= 25): fecha em 25/abril, vence 05/maio -> Fatura 2026-05
    const resAfter = computeInvoiceCycle('2026-03-26', 25, 5);
    expect(resAfter.invoiceMonth).toBe('2026-05');
    expect(resAfter.dueDate).toBe('2026-05-05');
  });

  it('faz clamping seguro do vencimento para meses com menos dias (fevereiro)', () => {
    // Vencimento dia 31, fatura de fevereiro em 2026 -> 2026-02-28
    const res = computeInvoiceCycle('2026-01-10', 20, 31);
    expect(res.invoiceMonth).toBe('2026-01');
    expect(res.dueDate).toBe('2026-01-31');

    const resFeb = computeInvoiceCycle('2026-01-25', 20, 31);
    expect(resFeb.invoiceMonth).toBe('2026-02');
    expect(resFeb.dueDate).toBe('2026-02-28');
  });
});
