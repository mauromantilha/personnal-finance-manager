import { describe, it, expect } from 'vitest';
import {
  standardNormalRandom,
  simulateMonteCarloGBM,
  calculateRiskMetrics,
  calculateEfficientFrontier,
} from './quantitative-math';

describe('quantitative-math', () => {
  it('standardNormalRandom gera distribuição com média próxima de 0', () => {
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      sum += standardNormalRandom();
    }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });

  it('simulateMonteCarloGBM projeta percentis consistentes (P90 >= P50 >= P10)', () => {
    const res = simulateMonteCarloGBM({
      initialAmount: 10000,
      monthlyContribution: 500,
      expectedAnnualReturnPct: 12,
      annualVolatilityPct: 18,
      months: 24,
      simulationsCount: 300,
      targetAmount: 25000,
    });

    expect(res.periods.length).toBe(25);
    expect(res.percentile50[24]).toBeGreaterThan(res.percentile10[24]);
    expect(res.percentile90[24]).toBeGreaterThan(res.percentile50[24]);
    expect(res.probPositiveReturn).toBeGreaterThanOrEqual(50);
    expect(res.samplePaths.length).toBe(5);
  });

  it('calculateRiskMetrics calcula VaR e CVaR com coerência matemática', () => {
    const metrics = calculateRiskMetrics({
      portfolioValue: 100000,
      expectedAnnualReturnPct: 14,
      annualVolatilityPct: 20,
      riskFreeRatePct: 10.5,
    });

    expect(metrics.var95Monthly).toBeGreaterThan(0);
    expect(metrics.var99Monthly).toBeGreaterThan(metrics.var95Monthly);
    expect(metrics.cvar95Monthly).toBeGreaterThan(metrics.var95Monthly);
    expect(metrics.sharpeRatio).toBeGreaterThan(0);
  });

  it('calculateEfficientFrontier calcula Max Sharpe e Min Volatilidade', () => {
    const assets = [
      { symbol: 'PETR4', name: 'Petrobras', weight: 0.4, expectedAnnualReturn: 16, annualVolatility: 24 },
      { symbol: 'VALE3', name: 'Vale', weight: 0.3, expectedAnnualReturn: 13, annualVolatility: 22 },
      { symbol: 'ITUB4', name: 'Itaú', weight: 0.3, expectedAnnualReturn: 15, annualVolatility: 17 },
    ];

    const res = calculateEfficientFrontier(assets, 10.5, 10);
    expect(res.frontier.length).toBeGreaterThan(0);
    expect(res.maxSharpePoint.sharpeRatio).toBeGreaterThanOrEqual(res.minVolatilityPoint.sharpeRatio);
    expect(res.minVolatilityPoint.volatility).toBeLessThanOrEqual(res.maxSharpePoint.volatility);
  });
});
