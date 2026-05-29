import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { mapCategory } from '../lib/mappers';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/categories', async (c) => {
  const db = c.get('db');
  const rows = await db.query('SELECT * FROM categories ORDER BY parent_id ASC NULLS FIRST, name ASC');
  return c.json(rows.map(mapCategory as any));
});

router.post('/categories', async (c) => {
  const db = c.get('db');
  const { name, parentId, icon, color, type } = await c.req.json<any>();
  if (!name) return c.json({ error: 'name obrigatório.' }, 400);

  const id = `cat-usr-${crypto.randomUUID()}`;
  await db.exec('INSERT INTO categories VALUES (?,?,?,?,?,?)',
    [id, name, parentId ?? null, icon ?? '📦', color ?? '#6B7280', type ?? 'both']);
  return c.json({ id }, 201);
});

router.put('/categories/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const { name, parentId, icon, color, type } = await c.req.json<any>();

  const row = await db.first('SELECT id FROM categories WHERE id = ?', [id]);
  if (!row) return c.json({ error: 'Categoria não encontrada.' }, 404);

  await db.exec('UPDATE categories SET name=?,parent_id=?,icon=?,color=?,type=? WHERE id=?',
    [name, parentId ?? null, icon ?? '📦', color ?? '#6B7280', type ?? 'both', id]);
  return c.json({ success: true });
});

router.delete('/categories/:id', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();

  const children = await db.query('SELECT id FROM categories WHERE parent_id = ?', [id]);
  if (children.length) return c.json({ error: 'Remova as subcategorias antes de excluir a categoria pai.' }, 400);

  await db.exec('DELETE FROM categories WHERE id = ?', [id]);
  return c.json({ success: true });
});

export default router;
