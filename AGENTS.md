# MKS Finanças — Agent Instructions

Multi-tenant personal finance SaaS. Frontend: React 19 + Vite + Tailwind CSS 4. Backend: two Cloudflare Workers (Hono). Database: Cloudflare D1 (SQLite, per-tenant). Storage: Cloudflare R2. AI: Groq LLM.

See [README.md](README.md) for the full feature catalogue and module descriptions.

---

## Commands

```bash
# Dev (frontend Vite + backend Express BFF, hot-reload)
npm run dev

# Type check only (no emit)
npm run lint          # tsc --noEmit

# Production build
npm run build         # Vite + esbuild → dist/

# Deploy workers (run from each worker directory)
cd workers/finance && npx wrangler deploy
cd workers/admin  && npx wrangler deploy

# Provision a new tenant family
node scripts/provision.mjs --name "Sobrenome" --subdomain sub --email admin@example.com
node scripts/provision.mjs ... --dry-run   # no real changes
```

See [scripts/README.md](scripts/README.md) for full provisioning/deprovisioning docs.

---

## Architecture

```
Frontend (React SPA)
  └── served by Express BFF (server.ts) in dev; static in prod
  └── calls /api/* endpoints → proxied to Finance Worker

workers/finance/   ← main user-facing API (Hono, CF Workers)
workers/admin/     ← ops/provisioning API (Hono, CF Workers, admin-only)
```

- **Multi-tenant**: Each family has its own D1 database. Tenant resolved via subdomain → `MKS_TENANTS` KV → D1 client.
- **Auth**: Cloudflare Access JWT (RS256). Middleware validates JWT, injects `userId`, `email`, `familyId`, `db` into Hono context (`c.get('db')`, etc.).
- **D1 access**: Via REST API ([workers/finance/src/lib/d1.ts](workers/finance/src/lib/d1.ts)), not bindings — because bindings are static-per-deploy but tenants are dynamic.

Key files:
- [workers/finance/src/index.ts](workers/finance/src/index.ts) — Finance Worker router & middleware
- [workers/admin/src/index.ts](workers/admin/src/index.ts) — Admin Worker router
- [workers/finance/src/lib/d1.ts](workers/finance/src/lib/d1.ts) — D1Client (`query`, `first`, `exec`, `batch`)
- [workers/finance/src/lib/access.ts](workers/finance/src/lib/access.ts) — JWT verification (JWKS cache)
- [workers/finance/src/lib/mappers.ts](workers/finance/src/lib/mappers.ts) — DB row → TypeScript type conversion
- [src/types.ts](src/types.ts) — All shared TypeScript types

---

## Key Conventions

### Currency
**Always store and transmit monetary values in centavos (integer cents).** No floats. Field names end in `InCents` (e.g., `amountInCents`, `balanceInCents`, `limitInCents`).

### Transaction Types
`'REC'` = income (Receita), `'DES'` = expense (Despesa), `'TRANS'` = transfer.

### Dates
ISO 8601: `YYYY-MM-DD` for dates, RFC 3339 for timestamps.

### IDs
Format: `{prefix}-{entity}-{timestamp}` (e.g., `tx-usr-1715062400000`). Use `Date.now()` for the timestamp portion.

### Invoice months
`YYYY-MM` string (e.g., `"2026-05"`).

### Component naming
PascalCase + `Module` suffix: `CoreFinanceModule`, `CreditCardModule`, `PredictiveAIModule`.

### Path alias
`@/` resolves to the project root (configured in [tsconfig.json](tsconfig.json)).

---

## Worker Route Pattern

```typescript
// workers/finance/src/routes/example.ts
import { Hono } from 'hono';
const router = new Hono<{ Variables: AppVariables }>();

router.post('/endpoint', async (c) => {
  const db = c.get('db');           // D1Client for this tenant
  const body = await c.req.json();
  // validate, then:
  await db.exec('INSERT INTO ...', [param1, param2]);
  return c.json(result, 201);
});

export default router;
```

- **Error responses**: `{ error: string, details?: string }` with appropriate HTTP status (400 validation, 401 auth, 404 not found, 500 server).
- **Batch DB ops**: Use `db.batch([{ sql, params }, ...])` for atomic-ish multi-statement operations.
- **No ACID transactions in D1**: Design for idempotency; use batch for grouped writes.

---

## Database

Migrations live in [migrations/](migrations/) (numbered `0001_` → `0013_`). Each new tenant runs all migrations at provision time.

**Core tables**: `accounts`, `transactions`, `budgets`, `goals`, `alerts`, `chat_history`  
**Extension tables**: `credit_cards`, `invoices`, `recurrences`, `documents`, `family_members`, `installment_groups`, `investments`, `users`, `lgpd_aceites`, `schema_migrations`, `categories`

To add a schema change: create a new numbered migration file, then add it to the provisioning flow.

---

## Frontend Component Pattern

All shared types are in [src/types.ts](src/types.ts). Components import from there — never define duplicate local types.

```typescript
// Direct fetch — no axios, no custom hooks
const res = await fetch('/api/transactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
```

- State: `useState` for form fields and UI state. No Redux/Zustand.
- Side effects: `useEffect` for initialization, `useCallback` for stable handlers.
- No React import needed (new JSX transform is configured).

---

## AI Integration

- **Chat / analysis**: `llama-3.3-70b-versatile` via [workers/finance/src/lib/groq.ts](workers/finance/src/lib/groq.ts)
- **Auto-categorization**: `llama-3.1-8b-instant`
- **OCR / vision**: `meta-llama/llama-4-scout-17b-16e-instruct`
- Routes: [workers/finance/src/routes/ai.ts](workers/finance/src/routes/ai.ts)

---

## Environment / Secrets

**Dev server** — needs `.env` at project root (never commit):
```
GROQ_API_KEY, APP_PASSWORD, APP_SECRET, CLOUDFLARE_API_TOKEN,
RESEND_API_KEY, APP_URL, D1_DATABASE_ID, R2_BUCKET
```

**Workers** — secrets set via `wrangler secret put`:
Finance: `CF_API_TOKEN`, `GROQ_API_KEY`, `RESEND_API_KEY`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `APP_SECRET`  
Admin: `CF_API_TOKEN`, `ADMIN_PASSWORD`, `RESEND_API_KEY`

Static vars (non-secret) are already in [workers/finance/wrangler.toml](workers/finance/wrangler.toml) and [workers/admin/wrangler.toml](workers/admin/wrangler.toml).
