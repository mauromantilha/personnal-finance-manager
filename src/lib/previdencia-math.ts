/**
 * Motor de Cálculo Tributário e Atuarial de Previdência Privada
 * MKS Finanças
 * 
 * Em conformidade com:
 * - Lei nº 14.803/2024 (Opção pelo regime tributário no momento do resgate/benefício)
 * - Lei nº 11.053/2004 (Tabela Regressiva de Previdência)
 * - Regulamento do Imposto de Renda (Decreto nº 9.580/2018 - RIR/2018)
 * - Resolução CVM 175 e Resolução CMN 4.994/2022
 */

export interface PrevidenciaInputs {
  currentAge: number;
  retirementAge: number;
  annualGrossIncome: number; // Renda Bruta Tributável Anual (R$)
  monthlyContribution: number; // Aporte mensal planejado (R$)
  initialBalance?: number; // Saldo inicial já existente (R$)
  taxDeclarationType: 'completo' | 'simplificado';
  expectedAnnualRealReturnPct: number; // Retorno real anual esperado líquido de inflação (%)
  managementFeePct?: number; // Taxa de administração (% a.a.)
  withdrawalType: 'unique' | 'monthly_fixed' | 'monthly_life';
  withdrawalYears?: number; // Para prazo determinado (ex: 15 ou 20 anos)
}

export interface PrevidenciaComparisonResult {
  accumulationYears: number;
  totalInvested: number;
  grossAccumulatedBalance: number;

  // PGBL Fiscal Benefício
  maxPgblAnnualDeduction: number; // Teto de 12% da renda bruta anual
  effectiveAnnualPgblContribution: number; // Aporte considerado para PGBL
  annualTaxRefundImmediate: number; // Restituição imediata estimada de IRPF (27.5%)
  
  // Saldos Projetados
  pgblGrossBalance: number;
  vgblGrossBalance: number;
  pgblBalanceWithReinvestedRefund: number; // Alavancagem fiscal dos juros compostos

  // Impostos no Resgate (Tabela Regressiva)
  regressiveTaxRateAtRetirement: number;
  pgblNetBalanceRegressive: number;
  vgblNetBalanceRegressive: number;
  pgblWithReinvestNetRegressive: number;

  // Impostos no Resgate (Tabela Progressiva)
  progressiveEstimatedTaxRate: number;
  pgblNetBalanceProgressive: number;
  vgblNetBalanceProgressive: number;
  pgblWithReinvestNetProgressive: number;

  // Recomendação e Break-even
  recommendedPlanType: 'PGBL' | 'VGBL';
  recommendedTaxRegime: 'Regressivo' | 'Progressivo';
  taxAdvantageReinvestmentBRL: number; // Vantagem em Reais do reinvestimento
  
  // Projeção de Renda Mensal Líquida na Aposentadoria
  estimatedMonthlyNetIncomeRegressive: number;
  estimatedMonthlyNetIncomeProgressive: number;

  // Curva de evolução temporal para gráficos
  timeline: Array<{
    year: number;
    age: number;
    invested: number;
    pgblGross: number;
    vgblGross: number;
    pgblWithReinvestment: number;
  }>;
}

/**
 * Retorna a alíquota da Tabela Regressiva pelo tempo de acumulação em anos
 * Lei nº 11.053/2004 e Lei nº 14.803/2024
 */
export function getRegressiveTaxRate(years: number): number {
  if (years < 2) return 0.35;
  if (years < 4) return 0.30;
  if (years < 6) return 0.25;
  if (years < 8) return 0.20;
  if (years < 10) return 0.15;
  return 0.10; // 10 anos ou mais
}

/**
 * Calcula a simulação completa de Previdência Privada PGBL vs VGBL
 */
export function calculatePrevidencia(inputs: PrevidenciaInputs): PrevidenciaComparisonResult {
  const {
    currentAge,
    retirementAge,
    annualGrossIncome,
    monthlyContribution,
    initialBalance = 0,
    taxDeclarationType,
    expectedAnnualRealReturnPct,
    managementFeePct = 0.5,
    withdrawalType = 'monthly_fixed',
    withdrawalYears = 20,
  } = inputs;

  const years = Math.max(1, retirementAge - currentAge);
  const months = years * 12;
  const netAnnualRate = Math.max(0, expectedAnnualRealReturnPct - managementFeePct) / 100;
  const monthlyRate = Math.pow(1 + netAnnualRate, 1 / 12) - 1;

  // Benefício Fiscal PGBL: teto de 12% da renda bruta anual tributável
  const maxPgblAnnualDeduction = annualGrossIncome * 0.12;
  const annualContribution = monthlyContribution * 12;
  const eligiblePgblAnnual = Math.min(annualContribution, maxPgblAnnualDeduction);
  
  // Restituição estimada de IRPF na alíquota marginal máxima (27.5%)
  const annualTaxRefundImmediate = taxDeclarationType === 'completo' ? eligiblePgblAnnual * 0.275 : 0;
  const monthlyRefundReinvested = annualTaxRefundImmediate / 12;

  // Acumulação padrão (sem reinvestir restituição)
  let balanceNormal = initialBalance;
  let balanceWithRefund = initialBalance;
  let totalInvested = initialBalance;

  const timeline: PrevidenciaComparisonResult['timeline'] = [
    {
      year: 0,
      age: currentAge,
      invested: initialBalance,
      pgblGross: initialBalance,
      vgblGross: initialBalance,
      pgblWithReinvestment: initialBalance,
    },
  ];

  for (let m = 1; m <= months; m++) {
    balanceNormal = balanceNormal * (1 + monthlyRate) + monthlyContribution;
    balanceWithRefund = balanceWithRefund * (1 + monthlyRate) + (monthlyContribution + monthlyRefundReinvested);
    totalInvested += monthlyContribution;

    if (m % 12 === 0) {
      const yr = m / 12;
      timeline.push({
        year: yr,
        age: currentAge + yr,
        invested: Math.round(totalInvested),
        pgblGross: Math.round(balanceNormal),
        vgblGross: Math.round(balanceNormal),
        pgblWithReinvestment: Math.round(balanceWithRefund),
      });
    }
  }

  const grossAccumulatedBalance = Math.round(balanceNormal);
  const pgblGrossBalance = grossAccumulatedBalance;
  const vgblGrossBalance = grossAccumulatedBalance;
  const pgblBalanceWithReinvestedRefund = Math.round(balanceWithRefund);

  // Ganhos de capital no VGBL
  const vgblEarnings = Math.max(0, vgblGrossBalance - totalInvested);

  // 1. Tabela Regressiva
  const regressiveRate = getRegressiveTaxRate(years);
  
  // PGBL: imposto sobre o total acumulado
  const pgblTaxRegressive = pgblGrossBalance * regressiveRate;
  const pgblNetBalanceRegressive = Math.round(pgblGrossBalance - pgblTaxRegressive);

  // VGBL: imposto apenas sobre o rendimento (lucro)
  const vgblTaxRegressive = vgblEarnings * regressiveRate;
  const vgblNetBalanceRegressive = Math.round(vgblGrossBalance - vgblTaxRegressive);

  // PGBL com reinvestimento da restituição: imposto sobre o total com restituição reinvestida
  const pgblWithReinvestTaxRegressive = pgblBalanceWithReinvestedRefund * regressiveRate;
  const pgblWithReinvestNetRegressive = Math.round(pgblBalanceWithReinvestedRefund - pgblWithReinvestTaxRegressive);

  // 2. Tabela Progressiva
  // Alíquota média ponderada estimada para a fase de aposentadoria (teto de 27.5% com deduções = ~20-22%)
  const progressiveEstimatedTaxRate = 0.20;

  const pgblTaxProgressive = pgblGrossBalance * progressiveEstimatedTaxRate;
  const pgblNetBalanceProgressive = Math.round(pgblGrossBalance - pgblTaxProgressive);

  const vgblTaxProgressive = vgblEarnings * progressiveEstimatedTaxRate;
  const vgblNetBalanceProgressive = Math.round(vgblGrossBalance - vgblTaxProgressive);

  const pgblWithReinvestTaxProgressive = pgblBalanceWithReinvestedRefund * progressiveEstimatedTaxRate;
  const pgblWithReinvestNetProgressive = Math.round(pgblBalanceWithReinvestedRefund - pgblWithReinvestTaxProgressive);

  // Recomendação do plano
  const recommendedPlanType = (taxDeclarationType === 'completo' && annualGrossIncome > 0) ? 'PGBL' : 'VGBL';
  // Com a Lei 14.803/2024, se o horizonte for >= 4 anos e houver renda relevante, o regime regressivo compensa
  const recommendedTaxRegime = years >= 4 ? 'Regressivo' : 'Progressivo';

  const taxAdvantageReinvestmentBRL = Math.max(0, pgblWithReinvestNetRegressive - vgblNetBalanceRegressive);

  // Cálculo de Renda Mensal na Aposentadoria (Anuidade financeira)
  // PMT = PV * [ r / (1 - (1+r)^(-n)) ]
  const retirementMonths = (withdrawalType === 'monthly_life' ? 25 : withdrawalYears) * 12;
  const safeRetirementMonthlyRate = Math.pow(1 + 0.04, 1 / 12) - 1; // 4% real ao ano na fase de desfrute

  const calcMonthlyIncome = (netBalance: number) => {
    if (safeRetirementMonthlyRate <= 0) return Math.round(netBalance / retirementMonths);
    const pmt = (netBalance * safeRetirementMonthlyRate) / (1 - Math.pow(1 + safeRetirementMonthlyRate, -retirementMonths));
    return Math.round(pmt);
  };

  const bestNetRegressive = recommendedPlanType === 'PGBL' ? pgblWithReinvestNetRegressive : vgblNetBalanceRegressive;
  const bestNetProgressive = recommendedPlanType === 'PGBL' ? pgblWithReinvestNetProgressive : vgblNetBalanceProgressive;

  const estimatedMonthlyNetIncomeRegressive = calcMonthlyIncome(bestNetRegressive);
  const estimatedMonthlyNetIncomeProgressive = calcMonthlyIncome(bestNetProgressive);

  return {
    accumulationYears: years,
    totalInvested: Math.round(totalInvested),
    grossAccumulatedBalance,
    maxPgblAnnualDeduction: Math.round(maxPgblAnnualDeduction),
    effectiveAnnualPgblContribution: Math.round(eligiblePgblAnnual),
    annualTaxRefundImmediate: Math.round(annualTaxRefundImmediate),
    pgblGrossBalance,
    vgblGrossBalance,
    pgblBalanceWithReinvestedRefund,
    regressiveTaxRateAtRetirement: +(regressiveRate * 100).toFixed(1),
    pgblNetBalanceRegressive,
    vgblNetBalanceRegressive,
    pgblWithReinvestNetRegressive,
    progressiveEstimatedTaxRate: +(progressiveEstimatedTaxRate * 100).toFixed(1),
    pgblNetBalanceProgressive,
    vgblNetBalanceProgressive,
    pgblWithReinvestNetProgressive,
    recommendedPlanType,
    recommendedTaxRegime,
    taxAdvantageReinvestmentBRL,
    estimatedMonthlyNetIncomeRegressive,
    estimatedMonthlyNetIncomeProgressive,
    timeline,
  };
}
