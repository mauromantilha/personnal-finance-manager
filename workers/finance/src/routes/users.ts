// Gerenciamento de usuários da família — modelo CF Access (sem senha/TOTP)
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { r2Put, r2Get } from '../lib/r2';
import { checkQuota, incrementStorage, formatBytes, STORAGE_UPGRADE_PRICE, STORAGE_PAID_BYTES } from '../lib/storage';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const CF_API = 'https://api.cloudflare.com/client/v4';

const AVATAR_URL_MAX_LEN = 512;
const AVATAR_URL_ALLOWED_ORIGINS = new Set(['https://api.dicebear.com']);

function isValidAvatarUrl(url: string): boolean {
  if (url === '/api/users/me/avatar') return true;
  if (url.length > AVATAR_URL_MAX_LEN) return false;
  try {
    const { protocol, origin } = new URL(url);
    return protocol === 'https:' && AVATAR_URL_ALLOWED_ORIGINS.has(origin);
  } catch {
    return false;
  }
}

// ── CF Access helpers ─────────────────────────────────────────────────────────

async function accessCreatePolicy(
  accountId: string, token: string, appId: string,
  name: string, email: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${CF_API}/accounts/${accountId}/access/apps/${appId}/policies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        decision: 'allow',
        include: [{ email: { email } }],
        exclude: [],
        require: [],
      }),
    });
    const d = await res.json() as any;
    return d.success ? d.result.id : null;
  } catch { return null; }
}

async function accessRevokeByEmail(
  accountId: string, token: string, appId: string, email: string,
): Promise<void> {
  try {
    const res = await fetch(`${CF_API}/accounts/${accountId}/access/apps/${appId}/policies?per_page=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await res.json() as any;
    if (!d.success) return;
    const targets = (d.result as any[]).filter(p =>
      p.include?.length === 1 && p.include[0].email?.email === email,
    );
    for (const p of targets) {
      await fetch(`${CF_API}/accounts/${accountId}/access/apps/${appId}/policies/${p.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch { /* best-effort */ }
}

/** LGPD: mascara email para visualização não-owner. user@example.com → u***@example.com */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(3, local.length - 1))}${domain}`;
}

router.get('/users', async (c) => {
  const db   = c.get('db');
  const user = c.get('user');
  const rows = await db.query<Record<string, unknown>>(
    'SELECT id, name, email, role, member_id, is_active, created_at, relationship FROM users ORDER BY created_at ASC',
  );
  // LGPD — minimização: members não veem email completo de outros usuários.
  // O próprio user sempre vê seu próprio email.
  const isOwner = user.role === 'owner';
  return c.json(rows.map(r => {
    const email = String(r.email ?? '');
    const isSelf = r.id === user.id;
    return {
      id: r.id, name: r.name,
      email: (isOwner || isSelf) ? email : maskEmail(email),
      role: r.role, memberId: r.member_id ?? null, isActive: r.is_active === 1, createdAt: r.created_at,
      relationship: r.relationship ?? null,
    };
  }));
});

// Pré-registra um usuário: na próxima vez que ele logar via CF Access,
// o middleware o encontra aqui e usa o role definido.
router.post('/users', async (c) => {
  const db   = c.get('db');
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Apenas o owner pode adicionar usuários.' }, 403);

  const { name, email, role, memberId: newMemberId, relationship } = await c.req.json<any>();
  if (!name || !email) return c.json({ error: 'name e email são obrigatórios.' }, 400);
  const nameStr = String(name).trim();
  if (nameStr.length < 2 || nameStr.length > 60 || !/^[\p{L}\p{N} .'\-]+$/u.test(nameStr))
    return c.json({ error: 'name: 2-60 caracteres, apenas letras, números, espaço, ponto, apóstrofo e hífen.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || String(email).length > 254)
    return c.json({ error: 'Email inválido.' }, 400);

  const dup = await db.first('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
  if (dup) return c.json({ error: 'Usuário com este email já existe.' }, 409);

  const id = `user-${crypto.randomUUID()}`;
  await db.exec(
    "INSERT INTO users (id,name,email,role,member_id,is_active,relationship,created_at) VALUES (?,?,?,?,?,1,?,datetime('now'))",
    [id, nameStr, email, role === 'owner' ? 'owner' : 'member', newMemberId || null, relationship || null],
  );

  // Cria policy no CF Access automaticamente
  const tenant = c.get('tenant');
  await accessCreatePolicy(
    c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN, tenant.accessAppId,
    `${nameStr} — acesso automático`, email,
  );

  return c.json({ success: true, userId: id });
});

router.delete('/users/:id', async (c) => {
  const db   = c.get('db');
  const user = c.get('user');
  const { id } = c.req.param();

  if (user.role !== 'owner') return c.json({ error: 'Apenas o owner pode remover usuários.' }, 403);
  if (id === user.id) return c.json({ error: 'Não é possível remover o próprio usuário.' }, 400);

  // Revoga CF Access antes de deletar do banco
  const target = await db.first<{ email: string }>('SELECT email FROM users WHERE id = ?', [id]);
  if (target) {
    const tenant = c.get('tenant');
    await accessRevokeByEmail(c.env.CF_ACCOUNT_ID, c.env.CF_API_TOKEN, tenant.accessAppId, target.email);
  }

  await db.exec('DELETE FROM invites WHERE user_id = ?', [id]);
  await db.exec('DELETE FROM users WHERE id = ?', [id]);
  return c.json({ success: true });
});

// PATCH /api/users/:id/member — vincula usuário a um membro da família
router.patch('/users/:id/member', async (c) => {
  const db   = c.get('db');
  const user = c.get('user');
  const { id } = c.req.param();

  if (user.role !== 'owner') return c.json({ error: 'Apenas o owner pode vincular usuários.' }, 403);

  const { memberId } = await c.req.json<any>();
  await db.exec('UPDATE users SET member_id = ? WHERE id = ?', [memberId || null, id]);
  return c.json({ success: true });
});

// ── Avatar do usuário ──────────────────────────────────────────────────────────

// GET /api/users/me/avatar — serve a imagem do R2
router.get('/users/me/avatar', async (c) => {
  const user   = c.get('user');
  const tenant = c.get('tenant');
  const bucket = c.env.MKS_DOCUMENTS;
  const key = `${tenant.r2Prefix}/avatars/user-${user.id}`;
  const obj = await r2Get(bucket, key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.contentType, 'Cache-Control': 'public, max-age=86400' },
  });
});

// PUT /api/users/me/avatar — faz upload de nova foto de perfil
router.put('/users/me/avatar', async (c) => {
  const user   = c.get('user');
  const tenant = c.get('tenant');
  const db     = c.get('db');
  const bucket = c.env.MKS_DOCUMENTS;

  const formData = await c.req.formData();
  const file = formData.get('avatar') as File | null;
  if (!file) return c.json({ error: 'Campo "avatar" é obrigatório.' }, 400);
  if (!ALLOWED_TYPES.has(file.type)) return c.json({ error: 'Tipo de arquivo não suportado. Use JPEG, PNG, WebP ou GIF.' }, 400);
  if (file.size > MAX_SIZE) return c.json({ error: 'Arquivo muito grande. Máximo: 2 MB.' }, 400);

  // Verificar cota antes de fazer upload
  const quotaErr = await checkQuota(c.env.MKS_TENANTS, tenant.familyId, tenant.storageTierBytes, file.size);
  if (quotaErr) {
    return c.json({
      error: 'QUOTA_EXCEEDED', code: 'QUOTA_EXCEEDED',
      usedBytes: quotaErr.usedBytes, limitBytes: quotaErr.limitBytes,
      usedFormatted: formatBytes(quotaErr.usedBytes),
      limitFormatted: formatBytes(quotaErr.limitBytes),
      upgradePrice: STORAGE_UPGRADE_PRICE,
      upgradeLimitBytes: STORAGE_PAID_BYTES,
    }, 402);
  }

  const buffer = await file.arrayBuffer();
  const key = `${tenant.r2Prefix}/avatars/user-${user.id}`;
  await r2Put(bucket, key, buffer, file.type);
  c.executionCtx.waitUntil(incrementStorage(c.env.MKS_TENANTS, tenant.familyId, file.size));

  const avatarUrl = `/api/users/me/avatar`;
  await db.exec('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, user.id]);

  return c.json({ success: true, avatarUrl });
});

// PATCH /api/users/me/avatar-url — salva URL de avatar pré-definido (sem upload)
router.patch('/users/me/avatar-url', async (c) => {
  const user = c.get('user');
  const db   = c.get('db');
  const { avatarUrl } = await c.req.json<{ avatarUrl: string }>();
  if (!avatarUrl) return c.json({ error: 'avatarUrl é obrigatório.' }, 400);
  if (!isValidAvatarUrl(avatarUrl)) return c.json({ error: 'URL de avatar inválida.' }, 400);
  await db.exec('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, user.id]);
  return c.json({ success: true, avatarUrl });
});

// ── Avatar da família ─────────────────────────────────────────────────────────

// GET /api/family/avatar — serve a foto da família
router.get('/family/avatar', async (c) => {
  const tenant = c.get('tenant');
  const bucket = c.env.MKS_DOCUMENTS;
  const key = `${tenant.r2Prefix}/avatars/family`;
  const obj = await r2Get(bucket, key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.contentType, 'Cache-Control': 'public, max-age=86400' },
  });
});

// PUT /api/family/avatar — upload da foto da família (apenas owner)
router.put('/family/avatar', async (c) => {
  const user   = c.get('user');
  const tenant = c.get('tenant');
  const bucket = c.env.MKS_DOCUMENTS;
  if (user.role !== 'owner') return c.json({ error: 'Apenas o owner pode alterar o avatar da família.' }, 403);

  const formData = await c.req.formData();
  const file = formData.get('avatar') as File | null;
  if (!file) return c.json({ error: 'Campo "avatar" é obrigatório.' }, 400);
  if (!ALLOWED_TYPES.has(file.type)) return c.json({ error: 'Tipo de arquivo não suportado. Use JPEG, PNG, WebP ou GIF.' }, 400);
  if (file.size > MAX_SIZE) return c.json({ error: 'Arquivo muito grande. Máximo: 2 MB.' }, 400);

  const quotaErr = await checkQuota(c.env.MKS_TENANTS, tenant.familyId, tenant.storageTierBytes, file.size);
  if (quotaErr) {
    return c.json({
      error: 'QUOTA_EXCEEDED', code: 'QUOTA_EXCEEDED',
      usedBytes: quotaErr.usedBytes, limitBytes: quotaErr.limitBytes,
      usedFormatted: formatBytes(quotaErr.usedBytes),
      limitFormatted: formatBytes(quotaErr.limitBytes),
      upgradePrice: STORAGE_UPGRADE_PRICE, upgradeLimitBytes: STORAGE_PAID_BYTES,
    }, 402);
  }

  const buffer = await file.arrayBuffer();
  const key = `${tenant.r2Prefix}/avatars/family`;
  await r2Put(bucket, key, buffer, file.type);
  c.executionCtx.waitUntil(incrementStorage(c.env.MKS_TENANTS, tenant.familyId, file.size));

  return c.json({ success: true, avatarUrl: '/api/family/avatar' });
});

export default router;
