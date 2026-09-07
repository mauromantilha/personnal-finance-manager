/**
 * Biblioteca Quantitativa e Probabilística para B3 / Mercado de Ações
 * MKS Finanças
 * 
 * Implementa:
 * 1. Simulação de Monte Carlo com Movimento Browniano Geométrico (GBM)
 * 2. Value at Risk (VaR 95% e 99%) e Conditional VaR (CVaR / Expected Shortfall)
 * 3. Otimização de Portfólio de Markowitz (Fronteira Eficiente)
 * 4. Métricas de Performance e Risco (Sharpe, Sortino, Drawdown)
 */

export interface MonteCarloSimulationResult {
  periods: number[]; // e.g. [0, 1, 2, ..., n] meses
  percentile10: number[]; // Cenário estresse / pessimista (P10)
  percentile50: number[]; // Cenário mediano / base (P50)
  percentile90: number[]; // Cenário otimista (P90)
  samplePaths: number[][]; // Amostra de 5 caminhos para visualização
  probPositiveReturn: number; // Probabilidade de ganho acumulado > 0 (%)
  expectedFinalValue: number; // Valor final médio
  targetProbability?: number; // Probabilidade de atingir meta informada
}

export interface RiskMetrics {
  var95Monthly: number;     // Value at Risk 95% em 1 mês (R$)
  var95MonthlyPct: number;  // Value at Risk 95% em 1 mês (%)
  var99Monthly: number;     // Value at Risk 99% em 1 mês (R$)
  var99MonthlyPct: number;  // Value at Risk 99% em 1 mês (%)
  cvar95Monthly: number;    // Conditional VaR 95% (Expected Shortfall) (R$)
  cvar95MonthlyPct: number; // Conditional VaR 95% (%)
  annualVolatility: number; // Volatilidade anualizada (%)
  sharpeRatio: number;      // Índice Sharpe (excedente sobre CDI)
  sortinoRatio: number;     // Índice Sortino (downside risk)
  maxHistoricalDrawdown: number; // Drawdown Máximo estimado (%)
}

export interface AssetProfile {
  symbol: string;
  name: string;
  expectedAnnualReturn: number; // % a.a.
  annualVolatility: number;     // % a.a.
  currentPrice: number;
}

export interface PortfolioAssetInput {
  symbol: string;
  name: string;
  weight: number; // 0.0 a 1.0 (soma = 1.0)
  expectedAnnualReturn: number;
  annualVolatility: number;
}

export interface EfficientFrontierPoint {
  volatility: number; // Eixo X (%)
  expectedReturn: number; // Eixo Y (%)
  sharpeRatio: number;
  weights: Record<string, number>;
}

export interface MarkowitzOptimizationResult {
  frontier: EfficientFrontierPoint[];
  maxSharpePoint: EfficientFrontierPoint;
  minVolatilityPoint: EfficientFrontierPoint;
  currentPortfolioPoint?: EfficientFrontierPoint;
}

// ─── Gerador Gaussiano Padrão (Box-Muller Transform) ──────────────────────────
export function standardNormalRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── 1. Simulação de Monte Carlo (Movimento Browniano Geométrico) ──────────────
/**
 * Executa simulação estocástica GBM com aporte inicial e aportes mensais recorrentes.
 * 
 * S_{t+dt} = S_t * exp((mu - 0.5 * sigma^2)*dt + sigma * sqrt(dt) * Z) + aporte
 */
export function simulateMonteCarloGBM(options: {
  initialAmount: number;
  monthlyContribution: number;
  expectedAnnualReturnPct: number;
  annualVolatilityPct: number;
  months: number;
  simulationsCount?: number;
  targetAmount?: number;
}): MonteCarloSimulationResult {
  const {
    initialAmount,
    monthlyContribution,
    expectedAnnualReturnPct,
    annualVolatilityPct,
    months,
    simulationsCount = 1000,
    targetAmount,
  } = options;

  const dt = 1 / 12; // passo mensal
  const mu = expectedAnnualReturnPct / 100;
  const sigma = annualVolatilityPct / 100;
  const drift = (mu - 0.5 * sigma * sigma) * dt;
  const diffusion = sigma * Math.sqrt(dt);

  const trajectories: Float64Array[] = [];
  for (let s = 0; s < simulationsCount; s++) {
    trajectories.push(new Float64Array(months + 1));
  }

  // Inicializa t = 0
  for (let s = 0; s < simulationsCount; s++) {
    trajectories[s][0] = initialAmount;
  }

  // Itera através dos meses
  for (let m = 1; m <= months; m++) {
    for (let s = 0; s < simulationsCount; s++) {
      const prev = trajectories[s][m - 1];
      const z = standardNormalRandom();
      const nextValue = prev * Math.exp(drift + diffusion * z) + monthlyContribution;
      trajectories[s][m] = Math.max(0, nextValue);
    }
  }

  // Agrega percentis mês a mês
  const periods: number[] = [];
  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];

  const tempArr = new Float64Array(simulationsCount);

  for (let m = 0; m <= months; m++) {
    periods.push(m);
    for (let s = 0; s < simulationsCount; s++) {
      tempArr[s] = trajectories[s][m];
    }
    tempArr.sort();

    const idx10 = Math.floor(simulationsCount * 0.10);
    const idx50 = Math.floor(simulationsCount * 0.50);
    const idx90 = Math.floor(simulationsCount * 0.90);

    p10.push(Math.round(tempArr[idx10]));
    p50.push(Math.round(tempArr[idx50]));
    p90.push(Math.round(tempArr[idx90]));
  }

  // Estatísticas finais
  const finalValues = new Float64Array(simulationsCount);
  let totalFinal = 0;
  let positiveCount = 0;
  let targetCount = 0;
  const totalInvested = initialAmount + monthlyContribution * months;

  for (let s = 0; s < simulationsCount; s++) {
    const finalVal = trajectories[s][months];
    finalValues[s] = finalVal;
    totalFinal += finalVal;
    if (finalVal > totalInvested) positiveCount++;
    if (targetAmount && finalVal >= targetAmount) targetCount++;
  }

  // Seleciona 5 caminhos representativos para plotagem detalhada
  const samplePaths: number[][] = [];
  const sampleIndices = [
    0,
    Math.floor(simulationsCount * 0.25),
    Math.floor(simulationsCount * 0.50),
    Math.floor(simulationsCount * 0.75),
    simulationsCount - 1,
  ];

  for (const idx of sampleIndices) {
    const path: number[] = [];
    for (let m = 0; m <= months; m++) {
      path.push(Math.round(trajectories[idx][m]));
    }
    samplePaths.push(path);
  }

  return {
    periods,
    percentile10: p10,
    percentile50: p50,
    percentile90: p90,
    samplePaths,
    probPositiveReturn: +( (positiveCount / simulationsCount) * 100 ).toFixed(1),
    expectedFinalValue: Math.round(totalFinal / simulationsCount),
    targetProbability: targetAmount
      ? +( (targetCount / simulationsCount) * 100 ).toFixed(1)
      : undefined,
  };
}

// ─── 2. Cálculo de Value at Risk (VaR) e Conditional VaR (CVaR) ───────────────
/**
 * Calcula VaR e CVaR paramétrico e métricas avançadas de risco de cauda.
 * 
 * @param portfolioValue Valor atual do portfólio em Reais
 * @param expectedAnnualReturnPct Retorno anual esperado (%)
 * @param annualVolatilityPct Volatilidade anualizada (%)
 * @param riskFreeRatePct Taxa livre de risco anual (CDI, default 10.5%)
 */
export function calculateRiskMetrics(options: {
  portfolioValue: number;
  expectedAnnualReturnPct: number;
  annualVolatilityPct: number;
  riskFreeRatePct?: number;
}): RiskMetrics {
  const {
    portfolioValue,
    expectedAnnualReturnPct,
    annualVolatilityPct,
    riskFreeRatePct = 10.5,
  } = options;

  const muAnnual = expectedAnnualReturnPct / 100;
  const sigmaAnnual = annualVolatilityPct / 100;

  // Conversão para horizonte mensal (1/12 ano)
  const dt = 1 / 12;
  const muMonthly = muAnnual * dt;
  const sigmaMonthly = sigmaAnnual * Math.sqrt(dt);

  // Fatores Z para distribuição normal padrão
  // Z_0.95 = 1.64485
  // Z_0.99 = 2.32635
  const z95 = 1.6448536269514722;
  const z99 = 2.3263478740408408;

  // VaR = - (mu - z * sigma)
  const var95Pct = Math.max(0, (z95 * sigmaMonthly - muMonthly) * 100);
  const var99Pct = Math.max(0, (z99 * sigmaMonthly - muMonthly) * 100);

  const var95Monthly = Math.round(portfolioValue * (var95Pct / 100));
  const var99Monthly = Math.round(portfolioValue * (var99Pct / 100));

  // CVaR (Expected Shortfall) para distribuição normal:
  // ES = mu - sigma * (phi(Z) / (1 - alpha))
  // Para alpha=0.95, phi(1.645) / 0.05 ~= 2.0627
  const esFactor95 = 2.0627128;
  const cvar95Pct = Math.max(0, (esFactor95 * sigmaMonthly - muMonthly) * 100);
  const cvar95Monthly = Math.round(portfolioValue * (cvar95Pct / 100));

  // Índice Sharpe: (Retorno - CDI) / Volatilidade
  const rf = riskFreeRatePct / 100;
  const excessReturn = muAnnual - rf;
  const sharpeRatio = sigmaAnnual > 0 ? +(excessReturn / sigmaAnnual).toFixed(2) : 0;

  // Índice Sortino: penaliza apenas volatilidade para baixo (downside deviation ~ 0.7 * sigma em normais)
  const downsideDeviation = sigmaAnnual * 0.707;
  const sortinoRatio = downsideDeviation > 0 ? +(excessReturn / downsideDeviation).toFixed(2) : 0;

  // Maximum Drawdown estimado analiticamente (Magdon-Ismail & Atiya approximation)
  // MDD aprox ~ 1.25 * sigma * sqrt(T)
  const maxDrawdown = +(Math.min(95, sigmaAnnual * 1.5 * 100)).toFixed(1);

  return {
    var95Monthly,
    var95MonthlyPct: +var95Pct.toFixed(2),
    var99Monthly,
    var99MonthlyPct: +var99Pct.toFixed(2),
    cvar95Monthly,
    cvar95MonthlyPct: +cvar95Pct.toFixed(2),
    annualVolatility: +annualVolatilityPct.toFixed(2),
    sharpeRatio,
    sortinoRatio,
    maxHistoricalDrawdown: maxDrawdown,
  };
}

// ─── 3. Fronteira Eficiente de Markowitz ───────────────────────────────────────
/**
 * Calcula a Fronteira Eficiente gerando uma grade de carteiras com diferentes
 * pesos e calculando risco x retorno a partir de matriz de covariância aproximada.
 */
export function calculateEfficientFrontier(
  assets: PortfolioAssetInput[],
  riskFreeRatePct = 10.5,
  pointsCount = 20,
): MarkowitzOptimizationResult {
  const n = assets.length;
  if (n === 0) {
    const dummyPoint: EfficientFrontierPoint = {
      volatility: 0,
      expectedReturn: 0,
      sharpeRatio: 0,
      weights: {},
    };
    return {
      frontier: [dummyPoint],
      maxSharpePoint: dummyPoint,
      minVolatilityPoint: dummyPoint,
    };
  }

  // Matriz de correlação média inter-ativos da B3 (suposição empírica padrão: rho = 0.35)
  const rho = 0.35;
  const covMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    covMatrix[i] = [];
    const sigmaI = assets[i].annualVolatility / 100;
    for (let j = 0; j < n; j++) {
      const sigmaJ = assets[j].annualVolatility / 100;
      covMatrix[i][j] = i === j ? sigmaI * sigmaI : rho * sigmaI * sigmaJ;
    }
  }

  // Função auxiliar para calcular risco e retorno de um vetor de pesos
  const calcMetrics = (weights: number[]): { expectedReturn: number; volatility: number; sharpe: number } => {
    let ret = 0;
    for (let i = 0; i < n; i++) ret += weights[i] * assets[i].expectedAnnualReturn;

    let variance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        variance += weights[i] * weights[j] * covMatrix[i][j];
      }
    }
    const vol = Math.sqrt(Math.max(0, variance)) * 100;
    const sharpe = vol > 0 ? (ret - riskFreeRatePct) / vol : 0;
    return { expectedReturn: +ret.toFixed(2), volatility: +vol.toFixed(2), sharpe: +sharpe.toFixed(2) };
  };

  // Ponto da carteira atual informada
  const currentWeights = assets.map(a => a.weight);
  const currentMetrics = calcMetrics(currentWeights);
  const currentPortfolioPoint: EfficientFrontierPoint = {
    volatility: currentMetrics.volatility,
    expectedReturn: currentMetrics.expectedReturn,
    sharpeRatio: currentMetrics.sharpe,
    weights: Object.fromEntries(assets.map(a => [a.symbol, +(a.weight * 100).toFixed(1)])),
  };

  // Amostragem aleatória dirigida (Monte Carlo de Portfólios de Dirichlet)
  const candidatePoints: EfficientFrontierPoint[] = [];
  const samples = 3000;

  for (let s = 0; s < samples; s++) {
    // Gera pesos aleatórios uniformes normalizados
    const rawWeights = assets.map(() => -Math.log(Math.random() || 0.001));
    const sumW = rawWeights.reduce((a, b) => a + b, 0);
    const w = rawWeights.map(v => v / sumW);

    const m = calcMetrics(w);
    candidatePoints.push({
      volatility: m.volatility,
      expectedReturn: m.expectedReturn,
      sharpeRatio: m.sharpe,
      weights: Object.fromEntries(assets.map((a, i) => [a.symbol, +(w[i] * 100).toFixed(1)])),
    });
  }

  // Encontra Max Sharpe e Min Volatilidade
  let maxSharpePoint = candidatePoints[0];
  let minVolatilityPoint = candidatePoints[0];

  for (const pt of candidatePoints) {
    if (pt.sharpeRatio > maxSharpePoint.sharpeRatio) maxSharpePoint = pt;
    if (pt.volatility < minVolatilityPoint.volatility) minVolatilityPoint = pt;
  }

  // Constrói a curva superior (Fronteira Eficiente):
  // Agrupa em fatias de volatilidade e pega o ponto de maior retorno em cada fatia
  const minVol = minVolatilityPoint.volatility;
  const maxVol = Math.max(...candidatePoints.map(p => p.volatility));
  const step = (maxVol - minVol) / pointsCount;

  const frontier: EfficientFrontierPoint[] = [];
  for (let i = 0; i <= pointsCount; i++) {
    const vLow = minVol + i * step;
    const vHigh = vLow + step * 1.5;

    const bucket = candidatePoints.filter(p => p.volatility >= vLow && p.volatility <= vHigh);
    if (bucket.length > 0) {
      let best = bucket[0];
      for (const b of bucket) {
        if (b.expectedReturn > best.expectedReturn) best = b;
      }
      frontier.push(best);
    }
  }

  frontier.sort((a, b) => a.volatility - b.volatility);

  return {
    frontier: frontier.length > 0 ? frontier : [minVolatilityPoint, maxSharpePoint],
    maxSharpePoint,
    minVolatilityPoint,
    currentPortfolioPoint,
  };
}
