import { Hono }      from 'hono';
import { getCookie } from 'hono/cookie';

import { verifyAccessJWT }       from './lib/access';
import { D1Client }              from './lib/d1';
import { mapUser, DbUser, User } from './lib/mappers';

import dataRoutes         from './routes/data';
import transactionRoutes  from './routes/transactions';
import accountRoutes      from './routes/accounts';
import budgetRoutes       from './routes/budgets';
import categoryRoutes     from './routes/categories';
import creditCardRoutes   from './routes/credit-cards';
import recurrenceRoutes   from './routes/recurrences';
import reportRoutes       from './routes/reports';
import familyRoutes       from './routes/family';
import installmentRoutes  from './routes/installments';
import investmentRoutes   from './routes/investments';
import userRoutes         from './routes/users';
import aiRoutes           from './routes/ai';
import marketRoutes       from './routes/market';
import documentRoutes     from './routes/documents';
import importerRoutes     from './routes/importers';
import backupRoutes       from './routes/backup';
import debtRoutes         from './routes/debts';
import storageRoutes      from './routes/storage';

const LGPD_CURRENT_VERSION = '2.0';

// ── Env bindings ──────────────────────────────────────────────────────────────
export interface Env {
  MKS_TENANTS:   KVNamespace;
  MKS_CACHE:     KVNamespace;
  MKS_DOCUMENTS: R2Bucket;
  CF_ACCOUNT_ID:    string;
  CF_ZONE_ID:       string;
  CF_TEAM_DOMAIN:   string;
  BASE_DOMAIN:      string;
  CF_API_TOKEN:       string;
  GROQ_API_KEY:       string;
  RESEND_API_KEY:     string;
}

// ── Tenant (lido do KV MKS_TENANTS) ──────────────────────────────────────────
export interface Tenant {
  name:           string;
  subdomain:      string;
  familyId:       string;
  tier:           1 | 2;
  d1DatabaseId:   string;
  r2Bucket:       string;
  r2Prefix:       string;
  accessAppId:    string;
  accessAppAud:   string;
  accessPolicyId: string;
  ownerEmailHash: string;
  status:             'pending' | 'active' | 'suspended' | 'deleted';
  createdAt:          string;
  storageTierBytes?:  number;  // undefined = plano free (300 MB)
}

// ── Variáveis de contexto Hono ────────────────────────────────────────────────
export interface Variables {
  tenant:   Tenant;
  db:       D1Client;
  email:    string;
  familyId: string;
  userId:   string;
  user:     User;
  lgpdOk:   boolean;
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Security headers ──────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  c.header('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), ' +
    'accelerometer=(), gyroscope=(), interest-cohort=()');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
});

// ── CSRF: exigir header customizado em mutações ───────────────────────────────
// Browsers só permitem headers custom em XHR/fetch same-origin OU CORS preflight.
// Bloqueia POST/PUT/PATCH/DELETE forjados por <form> em outro site.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use('/api/*', async (c, next) => {
  if (MUTATING.has(c.req.method)) {
    const xrw = c.req.header('X-Requested-With');
    if (xrw !== 'fetch') {
      return c.json({ error: 'CSRF guard: header X-Requested-With ausente.', code: 'CSRF_GUARD' }, 403);
    }
  }
  return next();
});

// ── Middleware 1: Tenant resolution ───────────────────────────────────────────
app.use('*', async (c, next) => {
  const host      = c.req.header('host') ?? '';
  const subdomain = host.split('.')[0];

  const tenant = await c.env.MKS_TENANTS.get(`tenant:${subdomain}`, 'json') as Tenant | null;

  if (!tenant)                        return c.json({ error: 'Tenant não encontrado' },  404);
  if (tenant.status === 'pending')    return c.json({ error: 'Conta aguardando verificação de email.', code: 'PENDING_VERIFICATION' }, 403);
  if (tenant.status === 'suspended')  return c.json({ error: 'Conta suspensa.' },         403);
  if (tenant.status === 'deleted')    return c.json({ error: 'Conta encerrada.' },         410);
  if (!tenant.d1DatabaseId)           return c.json({ error: 'Banco não configurado.' },  503);
  // Invariante de isolamento R2: sem prefixo válido, qualquer chamada R2 vazaria
  // entre tenants (key.startsWith('' + '/') = key.startsWith('/')).
  if (!tenant.r2Prefix || tenant.r2Prefix.length < 4)
    return c.json({ error: 'Tenant mal configurado (r2Prefix).' }, 503);

  c.set('tenant',   tenant);
  c.set('familyId', tenant.familyId);
  c.set('db', new D1Client(c.env.CF_ACCOUNT_ID, tenant.d1DatabaseId, c.env.CF_API_TOKEN));
  return next();
});

// ── Rota pública: health ──────────────────────────────────────────────────────
app.get('/api/health', (c) => {
  const tenant = c.get('tenant');
  return c.json({
    ok:        true,
    subdomain: tenant.subdomain,
    status:    tenant.status,
    timestamp: new Date().toISOString(),
  });
});

// ── Middleware 2: CF Access JWT verification ───────────────────────────────────
app.use('/api/*', async (c, next) => {
  const jwt = c.req.header('Cf-Access-Jwt-Assertion')
            ?? getCookie(c, 'CF_Authorization');

  if (!jwt) return c.json({ error: 'Não autenticado', code: 'NO_JWT' }, 401);

  try {
    const tenant = c.get('tenant');
    if (!tenant.accessAppAud) {
      return c.json({ error: 'Tenant sem audience configurado.', code: 'TENANT_MISCONFIGURED' }, 503);
    }
    const claims = await verifyAccessJWT(jwt, c.env.CF_TEAM_DOMAIN, tenant.accessAppAud, c.env.MKS_CACHE);
    c.set('email', claims.email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'JWT inválido';
    return c.json({ error: msg, code: 'INVALID_JWT' }, 401);
  }

  return next();
});

// ── Middleware 3: User lookup / first-access creation ─────────────────────────
app.use('/api/*', async (c, next) => {
  const db    = c.get('db');
  const email = c.get('email');

  let dbUser = await db.first<DbUser>(
    'SELECT * FROM users WHERE email = ? AND is_active = 1', [email],
  );

  if (!dbUser) {
    const isFirst = await db.first<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM users WHERE is_active = 1',
    );
    const role = (isFirst?.cnt ?? 0) === 0 ? 'owner' : 'member';
    const id   = crypto.randomUUID();
    const name = email.split('@')[0];

    await db.exec(
      "INSERT INTO users (id,name,email,role,is_active,created_at) VALUES (?,?,?,?,1,datetime('now'))",
      [id, name, email, role],
    );
    dbUser = await db.first<DbUser>('SELECT * FROM users WHERE id = ?', [id]);
  }

  if (!dbUser) return c.json({ error: 'Falha ao inicializar usuário' }, 500);

  const user = mapUser(dbUser);
  c.set('userId', user.id);
  c.set('user',   user);
  c.set('lgpdOk', user.lgpdPolicyVersion === LGPD_CURRENT_VERSION);

  return next();
});

// ── Auth / LGPD routes ────────────────────────────────────────────────────────
app.get('/api/auth/status', (c) => {
  const user   = c.get('user');
  const lgpdOk = c.get('lgpdOk');
  return c.json({
    ok:           true,
    lgpdRequired: !lgpdOk,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, memberId: user.memberId, avatarUrl: user.avatarUrl },
  });
});

app.post('/api/lgpd/accept', async (c) => {
  const user = c.get('user');
  const db   = c.get('db');

  if (c.get('lgpdOk')) return c.json({ ok: true, message: 'LGPD já aceita' });

  const ip        = c.req.header('CF-Connecting-IP') ?? null;
  const userAgent = c.req.header('user-agent') ?? null;

  await db.exec(
    "INSERT INTO lgpd_aceites (policy_version,user_id,ip_address,user_agent,accepted_at) VALUES (?,?,?,?,datetime('now'))",
    [LGPD_CURRENT_VERSION, user.id, ip, userAgent],
  );
  await db.exec(
    "UPDATE users SET lgpd_accepted_at = datetime('now'), lgpd_policy_version = ? WHERE id = ?",
    [LGPD_CURRENT_VERSION, user.id],
  );
  return c.json({ ok: true });
});

// ── Middleware: LGPD obrigatória para rotas de dados ──────────────────────────
app.use('/api/data', async (c, next) => {
  if (!c.get('lgpdOk')) return c.json({ error: 'LGPD não aceita', code: 'LGPD_REQUIRED' }, 403);
  return next();
});
app.use('/api/transactions/*', async (c, next) => {
  if (!c.get('lgpdOk')) return c.json({ error: 'LGPD não aceita', code: 'LGPD_REQUIRED' }, 403);
  return next();
});
app.use('/api/accounts/*', async (c, next) => {
  if (!c.get('lgpdOk')) return c.json({ error: 'LGPD não aceita', code: 'LGPD_REQUIRED' }, 403);
  return next();
});

// ── Montar routers ────────────────────────────────────────────────────────────
app.route('/api', dataRoutes);
app.route('/api', transactionRoutes);
app.route('/api', accountRoutes);
app.route('/api', budgetRoutes);
app.route('/api', categoryRoutes);
app.route('/api', creditCardRoutes);
app.route('/api', recurrenceRoutes);
app.route('/api', reportRoutes);
app.route('/api', familyRoutes);
app.route('/api', installmentRoutes);
app.route('/api', investmentRoutes);
app.route('/api', userRoutes);
app.route('/api', aiRoutes);
app.route('/api', marketRoutes);
app.route('/api', documentRoutes);
app.route('/api', importerRoutes);
app.route('/api', backupRoutes);
app.route('/api', debtRoutes);
app.route('/api', storageRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.all('*', (c) => c.json({ error: 'Rota não encontrada' }, 404));

export default app;
