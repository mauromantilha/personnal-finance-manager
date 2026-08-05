import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { requireOwner } from '../lib/authz';

const VALID_TYPES = ['CASH', 'CHECKING', 'SAVINGS', 'INVESTMENT'];
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.use('*', requireOwner);

router.post('/accounts', async (c) => {
  const db = c.get('db');
  const { name, type, bankName, balanceInCents, color, branch, accountNumber, accountDigit, managerName, managerPhone } = await c.req.json<any>();

  if (!name || !type || !bankName || balanceInCents === undefined)
    return c.json({ error: 'Preencha todos os campos obrigatórios.' }, 400);
  if (String(name).length > 100 || String(bankName).length > 100)
    return c.json({ error: 'name e bankName não podem ultrapassar 100 caracteres.' }, 400);
  if (!VALID_TYPES.includes(type))
    return c.json({ error: 'Tipo inválido.' }, 400);

  const balance = parseInt(String(balanceInCents), 10);
  if (isNaN(balance) || balance < 0)
    return c.json({ error: 'Saldo inicial deve ser não-negativo em centavos.' }, 400);

  const id = `acc-usr-${crypto.randomUUID()}`;
  await db.exec(
    'INSERT INTO accounts (id,name,type,bank_name,balance_in_cents,color,is_linked,branch,account_number,account_digit,manager_name,manager_phone) VALUES (?,?,?,?,?,?,0,?,?,?,?,?)',
    [id, name, type, bankName, balance, color ?? '#6B7280', branch ?? null, accountNumber ?? null, accountDigit ?? null, managerName ?? null, managerPhone ?? null],
  );
  return c.json({ id }, 201);
});

router.put('/accounts/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const { name, bankName, type, color, branch, accountNumber, accountDigit, managerName, managerPhone } = await c.req.json<any>();

  if (!name || !bankName) return c.json({ error: 'name e bankName são obrigatórios.' }, 400);
  if (type && !VALID_TYPES.includes(type)) return c.json({ error: 'Tipo inválido.' }, 400);

  const existing = await db.first('SELECT id FROM accounts WHERE id = ?', [id]);
  if (!existing) return c.json({ error: 'Conta não encontrada.' }, 404);

  await db.exec(
    'UPDATE accounts SET name=?,bank_name=?,type=?,color=?,branch=?,account_number=?,account_digit=?,manager_name=?,manager_phone=? WHERE id=?',
    [name, bankName, type ?? 'CHECKING', color ?? '#6B7280', branch ?? null, accountNumber ?? null, accountDigit ?? null, managerName ?? null, managerPhone ?? null, id],
  );
  return c.json({ success: true });
});

router.delete('/accounts/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();

  const count = await db.first<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM transactions WHERE account_id = ?', [id],
  );
  if ((count?.cnt ?? 0) > 0)
    return c.json({ error: 'Não é possível excluir conta com transações associadas.' }, 400);

  await db.exec('DELETE FROM accounts WHERE id = ?', [id]);
  return c.json({ success: true });
});

export default router;
