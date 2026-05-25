import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { getConnectToken, pluggyFetch } from '../lib/pluggy';
import { classifyMerchant } from '../lib/groq';
import { recalculateBudgets } from '../lib/helpers';
import { D1Stmt } from '../lib/d1';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/open-finance/configured', (c) => {
  return c.json({ configured: !!(c.env.PLUGGY_CLIENT_ID && c.env.PLUGGY_CLIENT_SECRET) });
});

router.post('/open-finance/connect-token', async (c) => {
  const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, BASE_DOMAIN } = c.env;
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET)
    return c.json({ error: 'Pluggy não configurado. Adicione PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.' }, 400);

  try {
    const tenant    = c.get('tenant');
    const webhookUrl = `https://${tenant.subdomain}.${BASE_DOMAIN}/api/webhooks/pluggy`;
    const token     = await getConnectToken(PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, webhookUrl);
    return c.json({ connectToken: token });
  } catch (e) {
    return c.json({ error: 'Pluggy connect token error', details: (e as Error).message }, 500);
  }
});

router.post('/open-finance/connect', async (c) => {
  const db = c.get('db');
  const { itemId, institutionName, logo } = await c.req.json<any>();
  if (!itemId) return c.json({ error: 'itemId é obrigatório' }, 400);

  const existing = await db.first<{ id: string }>('SELECT id FROM connections WHERE item_id = ?', [itemId]);
  let connId: string;

  if (existing) {
    connId = existing.id;
    await db.exec("UPDATE connections SET status = 'SYNCING' WHERE id = ?", [connId]);
  } else {
    connId = `conn-plg-${Date.now()}`;
    await db.exec('INSERT INTO connections VALUES (?,?,?,?,?,?)',
      [connId, institutionName ?? 'Banco', logo ?? '🏦', 'SYNCING', itemId, null]);
  }

  // Sync em background (waitUntil para não bloquear resposta)
  c.executionCtx.waitUntil(syncPluggyItem(c.env, db, itemId, connId));
  return c.json({ success: true, status: 'SYNCING', connId });
});

router.post('/open-finance/sync/:itemId', async (c) => {
  const db = c.get('db');
  const { itemId } = c.req.param();

  const conn = await db.first<{ id: string }>('SELECT id FROM connections WHERE item_id = ?', [itemId]);
  if (!conn) return c.json({ error: 'Conexão não encontrada' }, 404);

  await db.exec("UPDATE connections SET status = 'SYNCING' WHERE id = ?", [conn.id]);
  c.executionCtx.waitUntil(syncPluggyItem(c.env, db, itemId, conn.id));
  return c.json({ success: true, status: 'SYNCING' });
});

router.delete('/open-finance/connections/:itemId', async (c) => {
  const db = c.get('db');
  const { itemId } = c.req.param();
  const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = c.env;

  if (PLUGGY_CLIENT_ID && PLUGGY_CLIENT_SECRET) {
    pluggyFetch(PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, `/items/${itemId}`, { method: 'DELETE' }).catch(() => {});
  }
  await db.exec('DELETE FROM connections WHERE item_id = ?', [itemId]);
  return c.json({ success: true });
});

// Webhook Pluggy (item atualizado)
router.post('/webhooks/pluggy', async (c) => {
  const db = c.get('db');
  const payload = await c.req.json<{ itemId?: string; event?: string }>().catch(() => ({}));

  if (payload.event === 'item/updated' && payload.itemId) {
    const conn = await db.first<{ id: string }>('SELECT id FROM connections WHERE item_id = ?', [payload.itemId]);
    if (conn) {
      await db.exec("UPDATE connections SET status = 'SYNCING' WHERE id = ?", [conn.id]);
      c.executionCtx.waitUntil(syncPluggyItem(c.env, db, payload.itemId, conn.id));
    }
  }
  return c.json({ ok: true });
});

// ── Background sync ───────────────────────────────────────────────────────────
import type { D1Client } from '../lib/d1';

async function syncPluggyItem(env: Env, db: D1Client, itemId: string, connId: string): Promise<void> {
  const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = env;
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) return;

  try {
    const item = await pluggyFetch<any>(PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, `/items/${itemId}`);
    const accs = await pluggyFetch<{ results: any[] }>(PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, `/accounts?itemId=${itemId}`);

    const stmts: D1Stmt[] = [];

    for (const acc of accs.results) {
      const localId = `acc-plg-${acc.id}`;
      const existing = await db.first('SELECT id FROM accounts WHERE id = ?', [localId]);
      if (!existing) {
        const type = acc.type === 'BANK' ? 'CHECKING' : acc.type === 'CREDIT' ? 'INVESTMENT' : 'CHECKING';
        stmts.push({ sql: 'INSERT INTO accounts VALUES (?,?,?,?,?,?,1)', params: [localId, acc.name, type, item.connector?.name ?? 'Banco', Math.round((acc.balance ?? 0) * 100), '#6366F1'] });
      }

      const txs = await pluggyFetch<{ results: any[] }>(PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, `/transactions?accountId=${acc.id}&pageSize=100`);
      for (const tx of txs.results) {
        const txId   = `tx-plg-${tx.id}`;
        const txType = tx.type === 'CREDIT' ? 'REC' : 'DES';
        const cat    = classifyMerchant(tx.description ?? '');
        const amtCents = Math.round(Math.abs(tx.amount ?? 0) * 100);
        const txDate = tx.date?.split('T')[0] ?? new Date().toISOString().split('T')[0];
        stmts.push({
          sql: 'INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,original_merchant_name) VALUES (?,?,?,?,?,?,?,1,?)',
          params: [txId, amtCents, txDate, txType, cat, tx.description ?? 'Transação', localId, tx.description ?? null],
        });
      }
    }

    if (stmts.length) await db.batch(stmts);

    await db.exec(
      "UPDATE connections SET status = 'CONNECTED', last_synced_at = ? WHERE id = ?",
      [new Date().toISOString(), connId],
    );
    await db.exec('INSERT INTO alerts VALUES (?,?,?,?,?,?)',
      [`alert-plg-${Date.now()}`, 'SUCCESS',
        `Sincronização Concluída: ${item.connector?.name ?? 'Open Finance'}`,
        `${accs.results.length} conta(s) importada(s) via Pluggy Open Finance.`,
        new Date().toISOString(), 0],
    );
    await recalculateBudgets(db);
  } catch (e) {
    await db.exec("UPDATE connections SET status = 'ERROR' WHERE id = ?", [connId]).catch(() => {});
  }
}

export default router;
