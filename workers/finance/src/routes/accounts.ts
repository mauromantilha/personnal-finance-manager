import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { requireOwner } from '../lib/authz';
import { ensureTenantSchema } from '../lib/ensure-schema';

const VALID_TYPES = ['CASH', 'CHECKING', 'SAVINGS', 'INVESTMENT'];
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.use('*', requireOwner);

router.post('/accounts', async (c) => {
  const db = c.get('db');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON inválido.' }, 400);
  }
  const { name, type, bankName, balanceInCents, color, branch, accountNumber, accountDigit, managerName, managerPhone } = body;

  if (!name || !type || !bankName || balanceInCents === undefined || balanceInCents === null)
    return c.json({ error: 'Preencha todos os campos obrigatórios.' }, 400);
  if (String(name).length > 100 || String(bankName).length > 100)
    return c.json({ error: 'name e bankName não podem ultrapassar 100 caracteres.' }, 400);
  if (!VALID_TYPES.includes(type))
    return c.json({ error: 'Tipo inválido.' }, 400);

  const balance = parseInt(String(balanceInCents), 10);
  // Saldo inicial pode ser negativo (conta no vermelho / cheque especial)
  if (isNaN(balance))
    return c.json({ error: 'Saldo inicial inválido (centavos inteiros).' }, 400);

  try {
    await ensureTenantSchema(db);
  } catch (e) {
    console.error('[ensureTenantSchema]', (e as Error).message);
  }

  const id = `acc-usr-${crypto.randomUUID()}`;
  try {
    await db.exec(
      'INSERT INTO accounts (id,name,type,bank_name,balance_in_cents,color,is_linked,branch,account_number,account_digit,manager_name,manager_phone) VALUES (?,?,?,?,?,?,0,?,?,?,?,?)',
      [id, name, type, bankName, balance, color ?? '#6B7280', branch ?? null, accountNumber ?? null, accountDigit ?? null, managerName ?? null, managerPhone ?? null],
    );
    return c.json({
      id,
      account: {
        id, name, type, bankName, balanceInCents: balance, color: color ?? '#6B7280', isLinked: false,
        branch: branch ?? null, accountNumber: accountNumber ?? null, accountDigit: accountDigit ?? null,
        managerName: managerName ?? null, managerPhone: managerPhone ?? null,
      },
    }, 201);
  } catch (e) {
    return c.json({ error: 'Falha ao criar conta.', details: (e as Error).message }, 500);
  }
});

router.put('/accounts/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const body = await c.req.json<any>();
  const { name, bankName, type, color, branch, accountNumber, accountDigit, managerName, managerPhone } = body;

  if (!name || !bankName) return c.json({ error: 'name e bankName são obrigatórios.' }, 400);
  if (type && !VALID_TYPES.includes(type)) return c.json({ error: 'Tipo inválido.' }, 400);

  try { await ensureTenantSchema(db); } catch { /* best-effort */ }

  const existing = await db.first('SELECT id FROM accounts WHERE id = ?', [id]);
  if (!existing) return c.json({ error: 'Conta não encontrada.' }, 404);

  // Só atualiza campos bancários quando enviados explicitamente (evita apagar agência/conta/gerente no edit parcial)
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  await db.exec(
    `UPDATE accounts SET
      name=?,
      bank_name=?,
      type=?,
      color=?,
      branch=CASE WHEN ? THEN ? ELSE branch END,
      account_number=CASE WHEN ? THEN ? ELSE account_number END,
      account_digit=CASE WHEN ? THEN ? ELSE account_digit END,
      manager_name=CASE WHEN ? THEN ? ELSE manager_name END,
      manager_phone=CASE WHEN ? THEN ? ELSE manager_phone END
    WHERE id=?`,
    [
      name,
      bankName,
      type ?? 'CHECKING',
      color ?? '#6B7280',
      has('branch') ? 1 : 0, has('branch') ? (branch ?? null) : null,
      has('accountNumber') ? 1 : 0, has('accountNumber') ? (accountNumber ?? null) : null,
      has('accountDigit') ? 1 : 0, has('accountDigit') ? (accountDigit ?? null) : null,
      has('managerName') ? 1 : 0, has('managerName') ? (managerName ?? null) : null,
      has('managerPhone') ? 1 : 0, has('managerPhone') ? (managerPhone ?? null) : null,
      id,
    ],
  );
  return c.json({ success: true });
});

router.delete('/accounts/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();

  const asOrigin = await db.first<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM transactions WHERE account_id = ?', [id],
  );
  const asDest = await db.first<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM transactions WHERE destination_account_id = ?', [id],
  );
  if ((asOrigin?.cnt ?? 0) > 0 || (asDest?.cnt ?? 0) > 0)
    return c.json({ error: 'Não é possível excluir conta com transações associadas.' }, 400);

  await db.exec('DELETE FROM accounts WHERE id = ?', [id]);
  return c.json({ success: true });
});

export default router;
