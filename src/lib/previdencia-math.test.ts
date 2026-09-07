import { describe, it, expect } from 'vitest';
import { getRegressiveTaxRate, calculatePrevidencia } from './previdencia-math';

describe('previdencia-math', () => {
  it('tabela regressiva cumpre prazos legais da Lei 11.053/2004 e 14.803/2024', () => {
    expect(getRegressiveTaxRate(1)).toBe(0.35);
    expect(getRegressiveTaxRate(3)).toBe(0.30);
    expect(getRegressiveTaxRate(5)).toBe(0.25);
    expect(getRegressiveTaxRate(7)).toBe(0.20);
    expect(getRegressiveTaxRate(9)).toBe(0.15);
    expect(getRegressiveTaxRate(10)).toBe(0.10);
    expect(getRegressiveTaxRate(20)).toBe(0.10);
  });

  it('calcula benefício fiscal de 12% da renda bruta no PGBL', () => {
    const res = calculatePrevidencia({
      currentAge: 30,
      retirementAge: 60,
      annualGrossIncome: 100000,
      monthlyContribution: 1000, // 12.000 ao ano = exatamente 12%
      taxDeclarationType: 'completo',
      expectedAnnualRealReturnPct: 6,
      withdrawalType: 'monthly_fixed',
    });

    expect(res.maxPgblAnnualDeduction).toBe(12000);
    expect(res.effectiveAnnualPgblContribution).toBe(12000);
    // 12.000 * 27.5% = 3.300
    expect(res.annualTaxRefundImmediate).toBe(3300);
    expect(res.recommendedPlanType).toBe('PGBL');
    expect(res.regressiveTaxRateAtRetirement).toBe(10);
    expect(res.pgblBalanceWithReinvestedRefund).toBeGreaterThan(res.pgblGrossBalance);
  });

  it('recomenda VGBL para quem declara no modelo simplificado', () => {
    const res = calculatePrevidencia({
      currentAge: 35,
      retirementAge: 65,
      annualGrossIncome: 80000,
      monthlyContribution: 800,
      taxDeclarationType: 'simplificado',
      expectedAnnualRealReturnPct: 5.5,
      withdrawalType: 'monthly_fixed',
    });

    expect(res.annualTaxRefundImmediate).toBe(0);
    expect(res.recommendedPlanType).toBe('VGBL');
  });
});
