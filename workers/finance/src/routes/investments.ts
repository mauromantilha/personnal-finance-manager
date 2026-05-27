import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { mapInvestment } from '../lib/mappers';
import { groqChat } from '../lib/groq';

const VALID_CLASSES = ['fixed_income', 'stocks', 'fii', 'crypto', 'international', 'other'];
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/investments', async (c) => {
  const db = c.get('db');
  const rows = await db.query('SELECT * FROM investments ORDER BY start_date DESC');
  return c.json(rows.map(mapInvestment));
});

router.post('/investments', async (c) => {
  const db = c.get('db');
  const { name, ticker, assetClass, institution, investedInCents,
          currentValueInCents, annualRate, startDate, maturityDate, accountId, notes } = await c.req.json<any>();

  if (!name || !institution || !startDate)
    return c.json({ error: 'name, institution e startDate são obrigatórios.' }, 400);
  if (String(name).length > 200 || String(institution).length > 100)
    return c.json({ error: 'name (máx 200) e institution (máx 100) excederam o limite.' }, 400);
  if (notes && String(notes).length > 1000)
    return c.json({ error: 'notes não pode ultrapassar 1000 caracteres.' }, 400);

  const invested = parseInt(String(investedInCents ?? 0), 10);
  const current  = parseInt(String(currentValueInCents ?? invested), 10);
  const cls      = VALID_CLASSES.includes(assetClass) ? assetClass : 'other';
  const id       = `inv-${Date.now()}`;

  await db.exec(
    'INSERT INTO investments (id,name,ticker,asset_class,institution,invested_in_cents,current_value_in_cents,annual_rate,start_date,maturity_date,account_id,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, String(name).trim(), ticker?.trim() ?? null, cls, String(institution).trim(),
     invested, current, annualRate ?? null,
     startDate, maturityDate ?? null, accountId ?? null, notes?.trim() ?? null],
  );
  return c.json({ id }, 201);
});

router.put('/investments/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const { name, ticker, institution, currentValueInCents, annualRate, maturityDate, notes } = await c.req.json<any>();

  const row = await db.first('SELECT id FROM investments WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Investimento não encontrado.' }, 404);

  await db.exec(
    `UPDATE investments SET
       name                 = COALESCE(?, name),
       ticker               = COALESCE(?, ticker),
       institution          = COALESCE(?, institution),
       current_value_in_cents = COALESCE(?, current_value_in_cents),
       annual_rate          = COALESCE(?, annual_rate),
       maturity_date        = COALESCE(?, maturity_date),
       notes                = COALESCE(?, notes)
     WHERE id = ?`,
    [name?.trim() ?? null, ticker?.trim() ?? null, institution?.trim() ?? null,
     currentValueInCents !== undefined ? parseInt(String(currentValueInCents), 10) : null,
     annualRate ?? null, maturityDate ?? null, notes?.trim() ?? null, id],
  );
  return c.json({ success: true });
});

router.delete('/investments/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const row = await db.first('SELECT id FROM investments WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Investimento não encontrado.' }, 404);
  await db.exec('DELETE FROM investments WHERE id = ?', [id]);
  return c.json({ success: true });
});

// ── POST /api/investments/ai-import ──────────────────────────────────────────
router.post('/investments/ai-import', async (c) => {
  const { base64, mimeType } = await c.req.json<any>();
  if (!base64 || !mimeType)
    return c.json({ error: 'base64 e mimeType são obrigatórios.' }, 400);

  const key = c.env.GROQ_API_KEY;
  if (!key) return c.json({ error: 'Groq API key não configurada.' }, 503);

  const SYSTEM_PROMPT = `Você é um extrator especializado em extratos de investimentos brasileiros.
Analise o conteúdo fornecido e extraia TODAS as posições de investimento.
Retorne APENAS um objeto JSON válido no seguinte formato:
{
  "institution": "nome da corretora/banco",
  "positions": [
    {
      "name": "nome completo do ativo",
      "ticker": "código do ativo ou null",
      "assetClass": "fixed_income|stocks|fii|crypto|international|other",
      "investedInCents": número inteiro em centavos,
      "currentValueInCents": número inteiro em centavos,
      "annualRate": número decimal ou null,
      "startDate": "YYYY-MM-DD ou null",
      "maturityDate": "YYYY-MM-DD ou null",
      "notes": "info relevante ou null"
    }
  ]
}
Regras:
- Valores monetários SEMPRE em centavos (R$ 1.000,00 = 100000)
- assetClass: fixed_income = CDB/LCI/LCA/RDB/Tesouro/Poupança; stocks = ações; fii = Fundos Imobiliários; crypto = criptomoedas; international = BDR/ETF internacional; other = fundos multimercado e demais
- Se não identificar um campo, use null
- Inclua TODAS as posições visíveis, sem exceção
- Retorne APENAS o JSON, sem explicações adicionais`;

  try {
    let raw: string;
    const isImage = mimeType.startsWith('image/');
    if (isImage) {
      raw = await groqChat(key, 'meta-llama/llama-4-scout-17b-16e-instruct', [{
        role: 'user',
        content: [
          { type: 'text', text: SYSTEM_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      }], { response_format: { type: 'json_object' } });
    } else {
      const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
      const text = new TextDecoder().decode(bytes);
      raw = await groqChat(key, 'llama-3.3-70b-versatile', [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Extrato:\n${text.slice(0, 8000)}` },
      ], { response_format: { type: 'json_object' } });
    }

    const data = JSON.parse(raw) as { institution?: string; positions?: unknown[] };
    if (!Array.isArray(data.positions))
      return c.json({ error: 'IA não retornou posições válidas. Tente com outra imagem ou arquivo.' }, 422);

    return c.json(data);
  } catch (e: any) {
    console.error('[ai-import]', e?.message);
    return c.json({ error: e?.message ?? 'Erro ao processar extrato.' }, 500);
  }
});

export default router;
