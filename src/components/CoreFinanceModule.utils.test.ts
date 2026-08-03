import { describe, it, expect } from 'vitest';
import { parseMoneyToReais, parseMoneyToCents } from './CoreFinanceModule.utils';

describe('parseMoneyToReais', () => {
  it('parseia formato BR com milhar', () => {
    expect(parseMoneyToReais('1.234,56')).toBeCloseTo(1234.56);
    expect(parseMoneyToReais('5.000,00')).toBeCloseTo(5000);
  });
  it('aceita negativo', () => {
    expect(parseMoneyToReais('-500')).toBe(-500);
    expect(parseMoneyToReais('-1.234,56')).toBeCloseTo(-1234.56);
    expect(parseMoneyToReais('(250,00)')).toBeCloseTo(-250);
  });
  it('aceita zero e R$', () => {
    expect(parseMoneyToReais('0')).toBe(0);
    expect(parseMoneyToReais('R$ 10,50')).toBeCloseTo(10.5);
  });
});

describe('parseMoneyToCents', () => {
  it('converte para centavos inteiros', () => {
    expect(parseMoneyToCents('10,50')).toBe(1050);
    expect(parseMoneyToCents('-1.000,00')).toBe(-100000);
    expect(parseMoneyToCents('5.000,00')).toBe(500000);
  });
});
