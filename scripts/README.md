# Scripts — MKS Finanças

Arquitetura atual: **Cloudflare Workers + D1 + R2 + KV**. Não há mais VPS, PM2 ou
Cloudflare Tunnel — o antigo provisionamento por processo (`provision.mjs`,
`deprovision.mjs`) e o painel Node (`admin/server.mjs`) foram **removidos**.

Os scripts abaixo são utilitários de **migração/manutenção** que operam sobre o
KV `MKS_TENANTS` e os bancos D1. Todos aceitam `--dry-run`.

## Pré-requisitos

- `CLOUDFLARE_API_TOKEN` no `.env` da raiz com `D1:Edit`, `R2:Edit`, `KV:Write`
  (e `Access:Edit` para o script de domínio).

---

## Provisionar / destruir uma família

Feito pelo **Worker admin** (`workers/admin/`), não por CLI:

- **Provisionar:** painel `https://admin.financaslivre.com` → "Nova Família"
  (`POST /api/provision`), ou auto-cadastro público via `POST /public/register`.
- **Destruir (LGPD):** painel → Famílias → destruir (`DELETE /api/families/:subdomain`),
  que apaga D1 + R2 + índices KV.
- **Limpar pendentes órfãos:** `POST /api/maintenance/pending-cleanup` (dry-run por
  padrão; `?apply=1` para aplicar).

---

## Rodar migrations (`migrate-all.mjs`)

Aplica as migrations de [`../migrations/`](../migrations/) nos bancos D1 dos tenants.

```bash
node scripts/migrate-all.mjs                   # todas as famílias ativas (lê do KV)
node scripts/migrate-all.mjs --subdomain silva # somente uma
node scripts/migrate-all.mjs --main            # instância principal (D1_DATABASE_ID do .env)
node scripts/migrate-all.mjs --dry-run         # simula
```

## Migração de domínio (`migrate-to-financaslivre.mjs`)

One-shot: migra tenants de `mksbrasil.com` → `financaslivre.com` (DNS wildcard,
CF Access apps/policies, Pages custom domains, atualização do KV).

## Migração de metadata (`migrate-families-to-kv.mjs`)

One-shot histórico: importou `~/.mks-control/families.json` (arquitetura antiga)
para o KV `MKS_TENANTS`. Mantido apenas como referência.
