# Scripts de Provisionamento — MKS Finanças

## Pré-requisitos

### Permissões necessárias no token Cloudflare (`CLOUDFLARE_API_TOKEN`)

O token atual tem apenas `D1:Edit + R2:Edit`. Para o fluxo completo, adicione:

| Permissão | Para quê |
|---|---|
| `D1:Edit` | ✅ já tem — criar banco e rodar migrations |
| `R2:Edit` | ✅ já tem — criar e deletar buckets |
| `Cloudflare Tunnel:Edit` | Atualizar rotas do tunnel automaticamente |
| `Zone:DNS:Edit` | Criar CNAME para o subdomínio |
| `Zone:Read` | Buscar o Zone ID da zona mksbrasil.com |

> Sem as permissões de Tunnel e DNS, o script continua funcionando mas exibe aviso.
> Você precisará configurar manualmente no Cloudflare Dashboard:
> - Adicionar a rota no Zero Trust → Access → Tunnels → Configure
> - Criar o CNAME `{subdomain}.mksbrasil.com → {tunnel_id}.cfargotunnel.com`

### Onde fica o metadata

```
~/.mks-control/
  families.json             # lista de famílias provisionadas
  envs/{subdomain}.env      # env vars da instância (contém segredos)
  ecosystems/mks-{sub}.config.cjs  # ecosystem PM2 da instância
```

---

## Provisionar uma família

```bash
node scripts/provision.mjs \
  --name "Silva" \
  --subdomain silva \
  --email admin@silva.com
```

### Dry-run (sem alterações reais)

```bash
node scripts/provision.mjs --name "Silva" --subdomain silva --email admin@silva.com --dry-run
```

### O que o script faz

1. Valida: subdomínio único, e-mail único, limite de 10 famílias
2. Cria banco D1 na Cloudflare
3. Roda todas as 10 migrations no novo D1
4. Cria bucket R2 na Cloudflare
5. Gera `APP_SECRET`, senha temporária, `FAMILY_TOKEN`
6. Escreve `~/.mks-control/envs/{subdomain}.env`
7. Inicia processo PM2 (`mks-{subdomain}`)
8. Atualiza rotas do Cloudflare Tunnel *(requer permissão extra)*
9. Cria registro DNS CNAME *(requer permissão extra)*
10. Salva metadata em `families.json` (e-mail armazenado como SHA-256)
11. Envia e-mail de boas-vindas com política LGPD via Resend

---

## Destruir uma família (LGPD — Direito ao Esquecimento)

```bash
node scripts/deprovision.mjs --subdomain silva
```

Pede confirmação interativa (digitar o subdomínio). Para scripts automatizados:

```bash
node scripts/deprovision.mjs --subdomain silva --force
```

### O que o script faz

1. Para e remove o processo PM2
2. Esvazia e deleta o bucket R2 (todos os documentos)
3. Deleta o banco D1 (todos os dados financeiros)
4. Remove a rota do Cloudflare Tunnel
5. Remove o registro DNS
6. Remove arquivos `.env` e ecosystem PM2 locais
7. Registra tombstone em `families.json` (prova LGPD do direito ao esquecimento)

---

## Listar famílias

```bash
node -e "
const fs = require('fs');
const f = JSON.parse(fs.readFileSync(require('os').homedir() + '/.mks-control/families.json'));
console.table(f.map(x => ({ name: x.name, subdomain: x.subdomain, port: x.port, status: x.status, createdAt: x.createdAt.slice(0,10) })));
"
```
