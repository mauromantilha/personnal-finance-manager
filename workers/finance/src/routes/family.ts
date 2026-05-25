import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { mapFamilyMember } from '../lib/mappers';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/family', async (c) => {
  const db = c.get('db');
  const rows = await db.query('SELECT * FROM family_members ORDER BY created_at ASC');
  return c.json(rows.map(mapFamilyMember));
});

router.post('/family', async (c) => {
  const db = c.get('db');
  const { name, avatarColor } = await c.req.json<any>();
  if (!name) return c.json({ error: 'name obrigatório.' }, 400);

  const id = `fm-usr-${Date.now()}`;
  await db.exec(
    "INSERT INTO family_members (id,name,avatar_color,created_at) VALUES (?,?,?,datetime('now'))",
    [id, name, avatarColor ?? '#6366F1'],
  );
  return c.json({ id }, 201);
});

router.delete('/family/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();

  const row = await db.first('SELECT id FROM family_members WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Membro não encontrado.' }, 404);

  await db.exec('DELETE FROM family_members WHERE id = ?', [id]);
  return c.json({ success: true });
});

export default router;
