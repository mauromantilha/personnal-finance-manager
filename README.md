# Finanças Livre — Plataforma de Gestão Financeira Pessoal

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com)

Plataforma **open source** de finanças pessoais com IA preditiva, mercado em tempo real, gestão multi-usuário e integração com dados reais da B3 e Banco Central. Desenvolvida em React 19 + Cloudflare Workers (Hono) + D1/R2/KV.

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 + Lucide React + Recharts |
| Backend | Express.js (BFF) compilado via esbuild, rodando na porta 3000 |
| Banco de dados | Cloudflare D1 (SQLite via REST API) |
| Storage | Cloudflare R2 (documentos e extratos) |
| IA | Groq: `llama-3.3-70b-versatile` (análise/chat), `llama-3.1-8b-instant` (categorização), `meta-llama/llama-4-scout-17b-16e-instruct` (visão/OCR) |
| E-mail | Resend — `financas@mksbrasil.com` |
| Processo | PM2 (`mks-finance`) |
| Acesso externo | Cloudflare Tunnel → `https://financas.mksbrasil.com` |

---

## Módulos

### Dashboard
- KPIs: patrimônio líquido, receita/despesa do mês, taxa de poupança
- Widget de mercado ao vivo: IBOVESPA, 6 ações B3, SELIC, USD, EUR, BTC
- Notícias econômicas em tempo real: InfoMoney, G1 Economia, Valor Econômico (via RSS, cache 15 min)
- Painel de orçamentos ativos, recorrências próximas e utilização de cartões

### IA Preditiva
Duas abas:

**Análise Completa** — Diagnóstico gerado pelo Groq `llama-3.3-70b-versatile` com base em todos os dados do sistema:
- Score de saúde financeira 0–100 com gauge visual (SVG)
- Resumo executivo com números reais
- Alertas categorizados (CRÍTICO / ATENÇÃO / INFO)
- Análise de gastos com top categorias dos últimos 90 dias
- Análise de carteira de investimentos e diversificação
- Recomendações priorizadas com impacto e prazo
- Plano de ação numerado

**Chat Financeiro** — Assessor IA com contexto real do usuário:
- Modelo `llama-3.3-70b-versatile`, `temperature: 0.5`
- Posição financeira injetada no system prompt (patrimônio, renda, investimentos, cartões, orçamentos)
- Cobre: renda fixa, renda variável, FIIs, B3, câmbio, Selic, IPCA, previdência, planejamento patrimonial
- 8 quick starters pré-definidos
- Histórico de conversa com 12 mensagens de contexto

### Módulo 1 — Contas & Ledger
- Contas corrente, poupança, investimento, carteira, dinheiro
- Lançamentos manuais (receita, despesa, transferência) em centavos
- Categorização automática via Groq `llama-3.1-8b-instant`
- Ingestão de documentos com OCR via Groq Llama 4 Scout (visão)
- Filtros por tipo, categoria, membro, conta e período

### Módulo 2 — Cartões & Faturas
- Cadastro de cartões com limite, cor e data de vencimento
- Faturas mensais automáticas por cartão
- Lançamentos de despesas na fatura
- Indicador de utilização do limite

### Módulo 3 — Recorrências
- Débitos e créditos automáticos (mensal, semanal, diário, anual)
- Geração automática de transações nas datas configuradas
- Alerta de próximas recorrências nos 7 dias no dashboard

### Módulo 4 — Importar OFX
- Upload de arquivos OFX/QFX de qualquer banco brasileiro
- Parser client-side com suporte a SGML e XML OFX
- Preview com checkboxes antes de importar
- Deduplicação automática por `fitid`
- Categorização automática via IA após importação

### Módulo 5 — Planejamento
- Tetos de gastos por categoria com barras de progresso
- Recalculo automático com base nas transações do mês
- Metas de poupança com prazo, cor e aporte rápido
- Progresso percentual em tempo real

### Módulo 6 — Relatórios
- Gráfico de evolução do patrimônio líquido acumulado
- Pizza de despesas por categoria
- Barras mensais de receita vs despesa
- Projeção de caixa para 30 dias

### Módulo 7 — Notificações
- Alertas de estouro de orçamento
- Insights de progresso de metas
- Canais: e-mail e WhatsApp (configurável)

### Módulo 8 — Família
- Membros da família com nome e parentesco
- `member_id` nas transações para segmentação por pessoa
- Visão de gastos por membro

### Módulo 9 — Categorias
- CRUD de categorias personalizadas com ícone e cor
- Usadas em transações, orçamentos e analytics

### Módulo 10 — Parcelamentos
- Registro de compras parceladas com número de parcelas
- Geração automática das transações mensais
- Cancelamento de parcelamento

### Módulo 11 — Investimentos
- Renda fixa, renda variável, FIIs, câmbio, criptomoedas, previdência
- Taxa anual, data de início, valor aplicado e valor atual
- Rentabilidade total e por posição
- Alocação por classe de ativo (gráfico pizza)
- Projeção de crescimento da carteira

### Módulo 12 — Auth & IAM
- Login admin (senha master) + login usuários (email + senha)
- 2FA opcional via TOTP (Google Authenticator / Authy)
- QR Code gerado no ato da criação do usuário com 2FA
- Convite por e-mail via Resend com link de criação de senha (`?invite=token`)
- Gestão de usuários: criar, listar e remover

---

## Configuração

### Variáveis de ambiente (`.env`)

```env
GROQ_API_KEY=          # Chave Groq — llama-3.3-70b, llama-3.1-8b, llama-4-scout
APP_PASSWORD=          # Senha do administrador
APP_SECRET=            # Secret para HMAC dos tokens de sessão
CLOUDFLARE_API_TOKEN=  # Token com permissão D1 + R2
RESEND_API_KEY=        # Chave Resend para envio de e-mails
APP_URL=               # URL pública da aplicação (ex: https://financas.mksbrasil.com)
```

O arquivo `.env` está no `.gitignore` e nunca deve ser commitado.

### IDs Cloudflare

```
CF_ACCOUNT_ID   = 9b61f609fee4408fd1c4344feaf9b16a
D1_DATABASE_ID  = 06790b84-c635-4111-918d-cbdad49a2f29
R2_BUCKET       = mks-finance-storage
```

### Instalação e desenvolvimento local

```bash
npm install
npm run dev        # Frontend Vite + backend Express em hot-reload
```

### Build e produção

```bash
npm run build      # Compila frontend (dist/) + server (dist/server.cjs)
pm2 restart mks-finance --update-env
```

### Aplicar migrations D1

Sem wrangler — usar a REST API diretamente:

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/d1/database/$D1_DATABASE_ID/query" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sql": "CREATE TABLE IF NOT EXISTS ..."}'
```

---

## Estrutura de Arquivos

```
src/
  components/
    AIAdvisor.tsx          # (legado — não usado)
    AnalyticsModule.tsx
    AuthModule.tsx
    BudgetsModule.tsx
    CategoriesModule.tsx
    CoreFinanceModule.tsx
    CreditCardModule.tsx
    FamilyModule.tsx
    HealthReport.tsx
    InstallmentsModule.tsx
    InvestmentsModule.tsx
    LoginScreen.tsx
    MarketWidget.tsx        # Widget mercado ao vivo (B3, moedas, notícias)
    NotificationsModule.tsx
    OFXImportModule.tsx
    PredictiveAIModule.tsx  # IA Preditiva + Chat Financeiro
    RecurrencesModule.tsx
  App.tsx
  types.ts
server.ts                  # BFF Express — todos os endpoints
migrations/
  0001_init.sql … 0010_users.sql
```

---

## Dados de Mercado

| Dado | Fonte | Cache |
|---|---|---|
| Cotações B3 (IBOV + 6 ações) | brapi.dev | 5 min |
| USD / EUR / BTC | AwesomeAPI | 5 min |
| SELIC meta | BCB API oficial | 5 min |
| Notícias econômicas | RSS InfoMoney + G1 + Valor Econômico | 15 min |

Cache em memória no processo Node — sem Redis. Fallback stale-on-error: retorna o último dado válido se a fonte estiver fora do ar.

---

## Sprints Entregues

| Sprint | Entrega |
|---|---|
| 1–7 | Dashboard, Ledger, Cartões, Recorrências, Orçamentos, Metas, Analytics, Notificações |
| 8 | Módulo Família + `member_id` nas transações |
| 9 | Módulo Categorias customizáveis |
| 10 | Parcelamentos + Transferências + Health Score |
| 11 | Módulo Investimentos (carteira, alocação, projeção) |
| 12 | Integração Pluggy Open Finance (substituída no S13) |
| 13 | Importação OFX/QFX + Auth real (usuários, convites, 2FA TOTP) |
| 14 | IA Preditiva (análise completa + score + alertas + recomendações) |
| 15 | Chat Financeiro IA + Widget Mercado ao Vivo (B3, moedas, notícias RSS) |

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Este projeto é open source sob licença MIT.

### Como contribuir

1. **Fork** o repositório no GitHub
2. Crie uma branch descritiva: `git checkout -b feat/minha-feature`
3. Faça suas alterações seguindo as convenções do projeto (veja [AGENTS.md](AGENTS.md))
4. Commit com mensagem clara: `git commit -m "feat: descrição da feature"`
5. Abra um **Pull Request** descrevendo o que foi feito e por quê

### Diretrizes

- Siga as convenções do [AGENTS.md](AGENTS.md): centavos para moeda, tipos em `src/types.ts`, sem Redux
- Escreva código TypeScript tipado — sem `any` onde evitável
- Não quebre rotas existentes sem deprecação
- PRs que adicionam features devem incluir a migration SQL correspondente em `migrations/`

### Reportar bugs ou sugerir features

Abra uma [Issue no GitHub](../../issues) com o template adequado.

---

## 🚀 Deploy na sua conta Cloudflare

> Você pode hospedar sua própria instância do Finanças Livre na Cloudflare gratuitamente (plan gratuito suporta uso pessoal).

### Pré-requisitos

- Conta [Cloudflare](https://cloudflare.com) (gratuita)
- [Node.js 20+](https://nodejs.org) e npm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): `npm install -g wrangler`
- Domínio próprio na Cloudflare (ou use o subdomínio `.workers.dev` gratuito)
- Chave de API [Groq](https://console.groq.com) (gratuita — veja abaixo)

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/financas-livre
cd financas-livre

# 2. Instale as dependências
npm install
cd workers/finance && npm install && cd ../..

# 3. Autentique no Cloudflare
npx wrangler login

# 4. Crie os recursos necessários
npx wrangler kv namespace create MKS_TENANTS
npx wrangler kv namespace create MKS_CACHE
npx wrangler r2 bucket create mks-documents

# 5. Atualize os IDs gerados em workers/finance/wrangler.toml
#    Substitua os valores de id nas seções [[kv_namespaces]] e [[r2_buckets]]

# 6. Crie o banco D1 para sua família
npx wrangler d1 create mks-minha-familia
# Anote o database_id gerado

# 7. Configure as variáveis em workers/finance/wrangler.toml
#    CF_ACCOUNT_ID, CF_ZONE_ID, BASE_DOMAIN

# 8. Configure os secrets
cd workers/finance
npx wrangler secret put GROQ_API_KEY    # sua chave Groq
npx wrangler secret put APP_SECRET      # string aleatória (openssl rand -hex 32)

# 9. Aplique as migrations no D1
npx wrangler d1 execute mks-minha-familia --file=../../migrations/0001_schema.sql
# repita para 0002 até 0014

# 10. Deploy do Worker
npx wrangler deploy

# 11. Build e deploy do frontend
cd ../..
npm run build
npx wrangler pages deploy dist --project-name financas-livre
```

### Obtendo sua chave Groq (gratuita)

A IA preditiva usa a API da [Groq](https://groq.com), que oferece um **plano gratuito** generoso:

1. Acesse [console.groq.com](https://console.groq.com)
2. Crie uma conta gratuita (não requer cartão de crédito)
3. Vá em **API Keys** → **Create API Key**
4. Copie a chave (começa com `gsk_...`)
5. Configure: `npx wrangler secret put GROQ_API_KEY`

O plano gratuito inclui ~14.400 requisições/dia com `llama-3.3-70b-versatile`, mais que suficiente para uso pessoal.

> **Nota:** O módulo Admin multi-tenant não está incluído neste guia de self-deploy individual. Para hospedar múltiplas famílias, veja a documentação em [scripts/README.md](scripts/README.md).

