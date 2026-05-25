// Gerenciamento de usuários da família — modelo CF Access (sem senha/TOTP)
import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/users', async (c) => {
  const db = c.get('db');
  const rows = await db.query<Record<string, unknown>>(
    'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at ASC',
  );
  return c.json(rows.map(r => ({
    id: r.id, name: r.name, email: r.email,
    role: r.role, isActive: r.is_active === 1, createdAt: r.created_at,
  })));
});

// Pré-registra um usuário: na próxima vez que ele logar via CF Access,
// o middleware o encontra aqui e usa o role definido.
router.post('/users', async (c) => {
  const db   = c.get('db');
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Apenas o owner pode adicionar usuários.' }, 403);

  const { name, email, role } = await c.req.json<any>();
  if (!name || !email) return c.json({ error: 'name e email são obrigatórios.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return c.json({ error: 'Email inválido.' }, 400);

  const dup = await db.first('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
  if (dup) return c.json({ error: 'Usuário com este email já existe.' }, 409);

  const id = `user-${Date.now()}`;
  await db.exec(
    "INSERT INTO users (id,name,email,role,is_active,created_at) VALUES (?,?,?,?,1,datetime('now'))",
    [id, name, email, role === 'owner' ? 'owner' : 'member'],
  );

  // Sprint 4: atualizar CF Access Policy para permitir o email
  return c.json({ success: true, userId: id, note: 'Adicione o email na CF Access Policy da família para liberar o login.' });
});

router.delete('/users/:id', async (c) => {
  const db   = c.get('db');
  const user = c.get('user');
  const { id } = c.req.param();

  if (user.role !== 'owner') return c.json({ error: 'Apenas o owner pode remover usuários.' }, 403);
  if (id === user.id) return c.json({ error: 'Não é possível remover o próprio usuário.' }, 400);

  await db.exec('DELETE FROM invites WHERE user_id = ?', [id]);
  await db.exec('DELETE FROM users WHERE id = ?', [id]);
  return c.json({ success: true });
});

export default router;
