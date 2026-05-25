import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { groqChat, classifyMerchant } from '../lib/groq';
import { recalculateBudgets } from '../lib/helpers';
import {
  mapAccount, mapBudget, mapGoal, mapInvestment, mapCreditCard,
  mapInvoice, mapRecurrence, mapTransaction,
} from '../lib/mappers';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const brl = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

// ── POST /api/groq/advisor ────────────────────────────────────────────────────
router.post('/groq/advisor', async (c) => {
  const db  = c.get('db');
  const key = c.env.GROQ_API_KEY;
  const { message } = await c.req.json<any>();
  if (!message) return c.json({ error: 'Mensagem obrigatória.' }, 400);

  await recalculateBudgets(db);
  const [accounts, budgets, goals, txCount] = await Promise.all([
    db.query('SELECT * FROM accounts').then(r => r.map(mapAccount as any)),
    db.query('SELECT * FROM budgets').then(r => r.map(mapBudget)),
    db.query('SELECT * FROM goals').then(r => r.map(mapGoal)),
    db.first<{ cnt: number }>('SELECT COUNT(*) as cnt FROM transactions'),
  ]);

  const totalBalance   = (accounts as any[]).reduce((s, a) => s + a.balanceInCents, 0);
  const budgetSummary  = (budgets as any[]).map(b => `${b.category}: R$ ${(b.spentInCents / 100).toFixed(2)} de R$ ${(b.limitInCents / 100).toFixed(2)}`).join(', ');
  const goalsSummary   = (goals as any[]).map(g => `${g.name}: R$ ${(g.currentInCents / 100).toFixed(2)} de R$ ${(g.targetInCents / 100).toFixed(2)}`).join(', ');

  const systemPrompt = `Você é um Consultor Financeiro de elite para brasileiros. Seja cortês, preciso e empático.
Contexto financeiro:
- Patrimônio Total: ${brl(totalBalance)}
- Orçamentos: ${budgetSummary || 'nenhum configurado'}
- Metas: ${goalsSummary || 'nenhuma'}
- Total transações: ${txCount?.cnt ?? 0}

Retorne Markdown rico. Máximo 3 parágrafos ou bullet points acionáveis.`;

  if (!key) {
    return c.json({ reply: `### Análise MKS\n\nPatrimônio: **${brl(totalBalance)}**.\n\n> Configure GROQ_API_KEY para IA personalizada.` });
  }

  try {
    const reply = await groqChat(key, 'llama-3.3-70b-versatile',
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
      { temperature: 0.7, max_tokens: 1024 });
    return c.json({ reply });
  } catch (e) {
    return c.json({ error: 'Groq error', details: (e as Error).message }, 500);
  }
});

// ── POST /api/groq/categorize ─────────────────────────────────────────────────
router.post('/groq/categorize', async (c) => {
  const key = c.env.GROQ_API_KEY;
  const { merchantName } = await c.req.json<any>();
  if (!merchantName) return c.json({ error: 'merchantName obrigatório.' }, 400);

  if (!key) return c.json({ cleanDescription: merchantName, category: classifyMerchant(merchantName) });

  try {
    const raw = await groqChat(key, 'llama-3.1-8b-instant',
      [{ role: 'user', content: `Transação bancária: "${merchantName}". Retorne JSON com "cleanDescription" e "category" (Alimentação, Transporte, Moradia, Lazer, Saúde, Educação, Outros).` }],
      { temperature: 0.1, max_tokens: 100, response_format: { type: 'json_object' } });
    const parsed = JSON.parse(raw);
    return c.json({ cleanDescription: parsed.cleanDescription ?? merchantName, category: parsed.category ?? 'Outros' });
  } catch {
    return c.json({ cleanDescription: merchantName, category: classifyMerchant(merchantName) });
  }
});

// ── POST /api/ai/predictive ───────────────────────────────────────────────────
router.post('/ai/predictive', async (c) => {
  const db  = c.get('db');
  const key = c.env.GROQ_API_KEY;
  const now = new Date();

  await recalculateBudgets(db);

  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate    = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPrefix  = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const since90     = new Date(now); since90.setDate(since90.getDate() - 90);

  const [accounts, budgets, goals, investments, creditCards, invoices, recurrences,
         monthTxs, prevMonthTxs, topCats] = await Promise.all([
    db.query('SELECT * FROM accounts').then(r => r.map(mapAccount as any)),
    db.query('SELECT * FROM budgets').then(r => r.map(mapBudget)),
    db.query('SELECT * FROM goals').then(r => r.map(mapGoal)),
    db.query('SELECT * FROM investments ORDER BY start_date DESC').then(r => r.map(mapInvestment)),
    db.query("SELECT * FROM credit_cards WHERE is_active = 1").then(r => r.map(mapCreditCard as any)),
    db.query('SELECT * FROM invoices ORDER BY month DESC').then(r => r.map(mapInvoice as any)),
    db.query("SELECT * FROM recurrences WHERE is_active = 1").then(r => r.map(mapRecurrence as any)),
    db.query('SELECT * FROM transactions WHERE date LIKE ?', [`${monthPrefix}%`]).then(r => r.map(mapTransaction as any)),
    db.query('SELECT * FROM transactions WHERE date LIKE ?', [`${prevPrefix}%`]).then(r => r.map(mapTransaction as any)),
    db.query<{ category: string; total: number }>(
      "SELECT category, SUM(amount_in_cents) as total FROM transactions WHERE date >= ? AND type = 'DES' GROUP BY category ORDER BY total DESC LIMIT 10",
      [since90.toISOString().split('T')[0]],
    ),
  ]);

  const hasData = (accounts as any[]).length > 0 || (monthTxs as any[]).length > 0;
  const noDataResp = {
    insufficient_data: true,
    resumo_executivo: 'Nenhum dado financeiro. Cadastre contas e registre movimentações para receber a análise.',
    score_saude: { valor: 0, classificacao: 'Sem dados', justificativa: 'Dados insuficientes.' },
    alertas: [{ nivel: 'INFO', titulo: 'Sistema sem dados', descricao: 'Adicione contas e transações.', acao_sugerida: 'Cadastre sua primeira conta.' }],
    analise_gastos: { resumo: 'Sem dados.', ponto_atencao: null, top_categorias: [] },
    analise_investimentos: { resumo: 'Sem dados.', diversificacao: 'Sem investimentos', pontos: [], sugestoes: [] },
    recomendacoes: [], plano_acao: [], generatedAt: now.toISOString(),
  };

  if (!hasData) return c.json(noDataResp);

  const netWorth      = (accounts as any[]).reduce((s, a) => s + a.balanceInCents, 0);
  const monthIncome   = (monthTxs as any[]).filter((t: any) => t.type === 'REC').reduce((s, t) => s + t.amountInCents, 0);
  const monthExpense  = (monthTxs as any[]).filter((t: any) => t.type === 'DES').reduce((s, t) => s + t.amountInCents, 0);
  const prevIncome    = (prevMonthTxs as any[]).filter((t: any) => t.type === 'REC').reduce((s, t) => s + t.amountInCents, 0);
  const prevExpense   = (prevMonthTxs as any[]).filter((t: any) => t.type === 'DES').reduce((s, t) => s + t.amountInCents, 0);
  const savingsRate   = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0;
  const totalInvested = (investments as any[]).reduce((s, i) => s + i.investedInCents, 0);
  const totalInvVal   = (investments as any[]).reduce((s, i) => s + i.currentValueInCents, 0);
  const totalRecurr   = (recurrences as any[]).filter((r: any) => r.type === 'DES').reduce((s, r) => s + r.amountInCents, 0);
  const creditUsed    = (creditCards as any[]).reduce((s, card) => {
    const inv = (invoices as any[]).find(i => i.creditCardId === card.id && i.month === monthPrefix);
    return s + (inv?.totalInCents ?? 0);
  }, 0);
  const creditLimit   = (creditCards as any[]).reduce((s, c) => s + c.limitInCents, 0);
  const pct = (a: number, b: number) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : 'N/A';

  const context = {
    data_referencia: now.toLocaleDateString('pt-BR'),
    patrimonio_liquido: brl(netWorth),
    contas: (accounts as any[]).map(a => ({ nome: a.name, banco: a.bankName, tipo: a.type, saldo: brl(a.balanceInCents) })),
    mes_atual: { receitas: brl(monthIncome), despesas: brl(monthExpense), saldo_mes: brl(monthIncome - monthExpense), taxa_poupanca: `${savingsRate.toFixed(1)}%` },
    mes_anterior: { receitas: brl(prevIncome), despesas: brl(prevExpense), variacao_despesa: prevExpense > 0 ? `${(((monthExpense - prevExpense) / prevExpense) * 100).toFixed(1)}%` : 'N/A' },
    orcamentos: (budgets as any[]).map(b => ({ categoria: b.category, limite: brl(b.limitInCents), gasto: brl(b.spentInCents), percentual: pct(b.spentInCents, b.limitInCents), status: b.spentInCents >= b.limitInCents ? 'ESTOURADO' : b.spentInCents >= b.limitInCents * 0.8 ? 'ATENCAO' : 'OK' })),
    metas: (goals as any[]).map(g => ({ nome: g.name, meta: brl(g.targetInCents), atual: brl(g.currentInCents), progresso: pct(g.currentInCents, g.targetInCents), data_alvo: g.targetDate })),
    investimentos: { total_aplicado: brl(totalInvested), valor_atual: brl(totalInvVal), rentabilidade_total: totalInvested > 0 ? `${(((totalInvVal - totalInvested) / totalInvested) * 100).toFixed(2)}%` : 'N/A', posicoes: (investments as any[]).map(i => ({ nome: i.name, classe: i.assetClass, instituicao: i.institution, aplicado: brl(i.investedInCents), atual: brl(i.currentValueInCents), taxa_anual: i.annualRate ? `${i.annualRate}% a.a.` : null })) },
    cartoes_credito: (creditCards as any[]).map(card => { const inv = (invoices as any[]).find(i => i.creditCardId === card.id && i.month === monthPrefix); const used = inv?.totalInCents ?? 0; return { nome: card.name, limite: brl(card.limitInCents), fatura_atual: brl(used), utilizacao: pct(used, card.limitInCents) }; }),
    utilizacao_total_credito: `${creditLimit > 0 ? ((creditUsed / creditLimit) * 100).toFixed(1) : 0}%`,
    custos_fixos_mensais: brl(totalRecurr),
    top_categorias_despesa_90dias: topCats.map(r => ({ categoria: r.category, total: brl(r.total), participacao: pct(r.total, prevExpense + monthExpense) })),
  };

  if (!key) {
    return c.json({ ...noDataResp, insufficient_data: false, resumo_executivo: `Patrimônio: ${brl(netWorth)}. Configure GROQ_API_KEY para análise completa.`, generatedAt: now.toISOString() });
  }

  const systemPrompt = `Você é um Analista Financeiro Sênior e CFP especializado em finanças pessoais no Brasil.
REGRAS: 1) Baseie TODA análise nos dados JSON. 2) Cite números reais. 3) Responda em Português Brasileiro. 4) Retorne SOMENTE JSON válido conforme a estrutura abaixo.

ESTRUTURA JSON:
{"resumo_executivo":"string","score_saude":{"valor":0-100,"classificacao":"Excelente|Bom|Regular|Crítico","justificativa":"string"},"alertas":[{"nivel":"CRITICO|ATENCAO|INFO","titulo":"string","descricao":"string","acao_sugerida":"string"}],"analise_gastos":{"resumo":"string","ponto_atencao":"string|null","top_categorias":[{"categoria":"string","valor":"string","avaliacao":"string"}]},"analise_investimentos":{"resumo":"string","diversificacao":"Boa|Média|Fraca|Sem investimentos","pontos":["string"],"sugestoes":["string"]},"recomendacoes":[{"prioridade":1,"titulo":"string","descricao":"string","impacto":"Alto|Médio|Baixo","prazo":"Imediato|30 dias|90 dias|Longo prazo"}],"plano_acao":[{"ordem":1,"acao":"string","motivo":"string"}]}`;

  try {
    const raw  = await groqChat(key, 'llama-3.3-70b-versatile',
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Analise:\n${JSON.stringify(context, null, 2)}` }],
      { temperature: 0.2, max_tokens: 3000, response_format: { type: 'json_object' } });
    return c.json({ ...JSON.parse(raw), generatedAt: now.toISOString() });
  } catch (e) {
    return c.json({ error: 'Erro na análise preditiva.', details: (e as Error).message }, 500);
  }
});

// ── POST /api/ai/financial-chat ───────────────────────────────────────────────
router.post('/ai/financial-chat', async (c) => {
  const db  = c.get('db');
  const key = c.env.GROQ_API_KEY;
  const { message, history = [] } = await c.req.json<any>();
  if (!message) return c.json({ error: 'Mensagem obrigatória.' }, 400);
  if (!key) return c.json({ reply: 'Configure GROQ_API_KEY para habilitar o chat.' });

  const now = new Date();
  const mp  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [accounts, investments, creditCards, invoices, recurrences, monthTxs, budgets] = await Promise.all([
    db.query('SELECT * FROM accounts').then(r => r.map(mapAccount as any)),
    db.query('SELECT * FROM investments').then(r => r.map(mapInvestment)),
    db.query("SELECT * FROM credit_cards WHERE is_active = 1").then(r => r.map(mapCreditCard as any)),
    db.query('SELECT * FROM invoices WHERE month = ?', [mp]).then(r => r.map(mapInvoice as any)),
    db.query("SELECT * FROM recurrences WHERE is_active = 1 AND type = 'DES'").then(r => r.map(mapRecurrence as any)),
    db.query('SELECT * FROM transactions WHERE date LIKE ?', [`${mp}%`]).then(r => r.map(mapTransaction as any)),
    db.query('SELECT * FROM budgets').then(r => r.map(mapBudget)),
  ]);

  const netWorth     = (accounts as any[]).reduce((s, a) => s + a.balanceInCents, 0);
  const monthIncome  = (monthTxs as any[]).filter((t: any) => t.type === 'REC').reduce((s, t) => s + t.amountInCents, 0);
  const monthExpense = (monthTxs as any[]).filter((t: any) => t.type === 'DES').reduce((s, t) => s + t.amountInCents, 0);
  const totalInvest  = (investments as any[]).reduce((s, i) => s + (i as any).investedInCents, 0);
  const totalInvVal  = (investments as any[]).reduce((s, i) => s + (i as any).currentValueInCents, 0);
  const fixedCosts   = (recurrences as any[]).reduce((s, r) => s + (r as any).amountInCents, 0);
  const creditUsed   = (creditCards as any[]).reduce((s, card) => { const inv = (invoices as any[]).find(i => i.creditCardId === (card as any).id); return s + (inv?.totalInCents ?? 0); }, 0);
  const creditLimit  = (creditCards as any[]).reduce((s, c) => s + (c as any).limitInCents, 0);
  const overBudgets  = (budgets as any[]).filter(b => (b as any).spentInCents >= (b as any).limitInCents).map(b => (b as any).category);
  const savings      = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0;

  const summary = `=== POSIÇÃO FINANCEIRA (${now.toLocaleDateString('pt-BR')}) ===
Patrimônio: ${brl(netWorth)} | Receita mês: ${brl(monthIncome)} | Despesa mês: ${brl(monthExpense)} | Saldo: ${brl(monthIncome - monthExpense)} | Poupança: ${savings.toFixed(1)}%
Custos fixos: ${brl(fixedCosts)} | Investimentos: aplicado ${brl(totalInvest)} / valor ${brl(totalInvVal)}
Cartões: limite ${brl(creditLimit)} / fatura ${brl(creditUsed)} (${creditLimit > 0 ? ((creditUsed / creditLimit) * 100).toFixed(1) : 0}% utilização)
Orçamentos estourados: ${overBudgets.length === 0 ? 'nenhum' : overBudgets.join(', ')}
Contas: ${(accounts as any[]).map(a => `${a.name} ${brl(a.balanceInCents)}`).join(', ') || 'nenhuma'}`;

  const sysPrompt = `Você é o MKS Finance AI, assessor financeiro certificado (CFP) especializado no mercado brasileiro. Responda em pt-BR, máximo 400 palavras. Cite dados reais do usuário quando relevante.

${summary}`;

  try {
    const msgs = [
      { role: 'system' as const, content: sysPrompt },
      ...(history as any[]).slice(-12).map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user' as const, content: message },
    ];
    const reply = await groqChat(key, 'llama-3.3-70b-versatile', msgs, { temperature: 0.5, max_tokens: 1500 });
    return c.json({ reply });
  } catch (e) {
    return c.json({ error: 'Erro no chat.', details: (e as Error).message }, 500);
  }
});

export default router;
