import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { groqChat } from '../lib/groq';
import { mapAccount, mapTransaction } from '../lib/mappers';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

function resolveGroqKey(c: any): string {
  const header = c.req.header('X-Groq-Api-Key') ?? '';
  if (header.startsWith('gsk_') && header.length > 20) return header;
  return c.env.GROQ_API_KEY ?? '';
}

const brl = (n: number) => `R$ ${(n / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

interface DbDebt {
  id: string;
  creditor: string;
  type: string;
  original_amount_in_cents: number;
  current_amount_in_cents: number;
  due_date: string | null;
  months_overdue: number;
  status: string;
  notes: string | null;
  created_at: string;
}

function mapDebt(r: DbDebt) {
  return {
    id: r.id,
    creditor: r.creditor,
    type: r.type,
    originalAmountInCents: r.original_amount_in_cents,
    currentAmountInCents: r.current_amount_in_cents,
    dueDate: r.due_date,
    monthsOverdue: r.months_overdue,
    status: r.status as 'ativo' | 'negociando' | 'quitado',
    notes: r.notes,
    createdAt: r.created_at,
  };
}

// ── GET /api/debts ─────────────────────────────────────────────────────────────
router.get('/debts', async (c) => {
  const db = c.get('db');
  const rows = await db.query<DbDebt>('SELECT * FROM debts ORDER BY current_amount_in_cents DESC');
  return c.json({ debts: rows.map(mapDebt) });
});

// ── POST /api/debts ────────────────────────────────────────────────────────────
router.post('/debts', async (c) => {
  const db = c.get('db');
  const { creditor, type, originalAmountInCents, currentAmountInCents,
          dueDate, monthsOverdue, status, notes } = await c.req.json<any>();

  if (!creditor || !type || !originalAmountInCents || !currentAmountInCents)
    return c.json({ error: 'creditor, type, originalAmountInCents e currentAmountInCents são obrigatórios.' }, 400);

  const id = `debt-${crypto.randomUUID()}`;
  await db.exec(
    'INSERT INTO debts (id,creditor,type,original_amount_in_cents,current_amount_in_cents,due_date,months_overdue,status,notes) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, creditor, type, originalAmountInCents, currentAmountInCents,
     dueDate ?? null, monthsOverdue ?? 0, status ?? 'ativo', notes ?? null],
  );
  return c.json({ id }, 201);
});

// ── PUT /api/debts/:id ─────────────────────────────────────────────────────────
router.put('/debts/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const { creditor, type, originalAmountInCents, currentAmountInCents,
          dueDate, monthsOverdue, status, notes } = await c.req.json<any>();

  await db.exec(
    'UPDATE debts SET creditor=?,type=?,original_amount_in_cents=?,current_amount_in_cents=?,due_date=?,months_overdue=?,status=?,notes=? WHERE id=?',
    [creditor, type, originalAmountInCents, currentAmountInCents,
     dueDate ?? null, monthsOverdue ?? 0, status ?? 'ativo', notes ?? null, id],
  );
  return c.json({ success: true });
});

// ── DELETE /api/debts/:id ──────────────────────────────────────────────────────
router.delete('/debts/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  await db.exec('DELETE FROM debts WHERE id = ?', [id]);
  return c.json({ success: true });
});

// ── POST /api/debts/analyze — IA analisa dívidas e propõe estratégias ──────────
router.post('/debts/analyze', async (c) => {
  const db  = c.get('db');
  const key = resolveGroqKey(c);
  if (!key) return c.json({ error: 'GROQ_KEY_MISSING' }, 401);

  const now = new Date();
  const mp  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [debtRows, accountRows, txRows] = await Promise.all([
    db.query<DbDebt>("SELECT * FROM debts WHERE status != 'quitado'"),
    db.query('SELECT * FROM accounts').then(r => r.map(mapAccount as any)),
    db.query('SELECT * FROM transactions WHERE date LIKE ?', [`${mp}%`]).then(r => r.map(mapTransaction as any)),
  ]);

  const debts = debtRows.map(mapDebt);
  if (debts.length === 0) return c.json({ analysis: 'Nenhuma dívida ativa cadastrada.' });

  const totalDebt    = debts.reduce((s, d) => s + d.currentAmountInCents, 0);
  const netWorth     = (accountRows as any[]).reduce((s, a) => s + a.balanceInCents, 0);
  const monthIncome  = (txRows as any[]).filter((t: any) => t.type === 'REC').reduce((s, t) => s + t.amountInCents, 0);
  const monthExpense = (txRows as any[]).filter((t: any) => t.type === 'DES').reduce((s, t) => s + t.amountInCents, 0);
  const available    = monthIncome - monthExpense;

  const debtsSummary = debts.map(d => ({
    credor: d.creditor,
    tipo: d.type,
    valorOriginal: brl(d.originalAmountInCents),
    valorAtual: brl(d.currentAmountInCents),
    mesesAtraso: d.monthsOverdue,
    vencimento: d.dueDate ?? 'não informado',
    status: d.status,
    observacoes: d.notes ?? '',
  }));

  const systemPrompt = `Você é um especialista brasileiro em finanças pessoais e negociação de dívidas, com profundo conhecimento sobre:

- Como bancos, financeiras e operadoras de cartão negociam dívidas em atraso no Brasil
- Como credores vendem carteiras de crédito podres para recuperadoras (tipicamente por 1% a 10% do valor face), e como isso cria oportunidades de negociação com deságio
- Programas como Desenrola Brasil, Feirão Limpa Nome, negociações diretas via SAC
- Estratégias de estancamento: quando ESPERAR é melhor (dívida próxima de prescrição, credor prestes a vender para recuperadora)
- Prazo de prescrição: 5 anos geral (Código Civil), 3 anos para cartão de crédito
- Negociação direta com credor original vs. recuperadora de crédito
- Impacto no score Serasa/SPC e estratégias para recuperação de score
- Parcelamento, desconto à vista, suspensão de juros, pagamento parcial

SITUAÇÃO FINANCEIRA DO USUÁRIO:
- Patrimônio líquido: ${brl(netWorth)}
- Receita do mês: ${brl(monthIncome)}
- Despesas do mês: ${brl(monthExpense)}
- Saldo disponível após despesas: ${brl(available)}
- Total de dívidas ativas: ${brl(totalDebt)}

DÍVIDAS CADASTRADAS:
${JSON.stringify(debtsSummary, null, 2)}

INSTRUÇÕES DE RESPOSTA:
- Analise cada dívida individualmente com estratégia específica
- Para dívidas com mais de 6 meses em atraso: mencione possibilidade de aguardar venda para recuperadora e negociar com deságio de 70-90%
- Para dívidas com prazo de prescrição próximo: informe a data e a estratégia de esperar
- Para dívidas recentes: sugira renegociação direta e plano de quitação viável com o saldo disponível
- Ao final, apresente um plano de ação priorizado (qual dívida atacar primeiro e por quê)
- Seja específico, empático e prático
- Use Markdown: ## para seções, **negrito** para valores e pontos-chave, - para listas
- Máximo 700 palavras`;

  try {
    const analysis = await groqChat(
      key,
      'llama-3.3-70b-versatile',
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Analise minhas dívidas e proponha as melhores estratégias de resolução para minha situação.' },
      ],
      { temperature: 0.4, max_tokens: 2500 },
    );
    const DISCLAIMER = '\n\n---\n*⚠️ Orientações gerais — não substituem aconselhamento financeiro ou jurídico profissional. Consulte um especialista antes de tomar decisões.*';
    return c.json({ analysis: analysis + DISCLAIMER });
  } catch (e: any) {
    const msg = e?.message ?? '';
    if (msg.includes('429') || /rate.?limit/i.test(msg))
      return c.json({ error: 'RATE_LIMIT' }, 429);
    return c.json({ error: 'Erro na análise.', details: msg }, 500);
  }
});

export default router;
