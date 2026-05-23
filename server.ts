/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import Groq from 'groq-sdk';
import {
  FinancialAccount,
  Transaction,
  BankConnection,
  CategoryBudget,
  FinancialGoal,
  NotificationAlert,
  ChatMessage
} from './src/types';
import {
  INITIAL_ACCOUNTS,
  INITIAL_CONNECTIONS,
  INITIAL_TRANSACTIONS,
  INITIAL_BUDGETS,
  INITIAL_GOALS,
  INITIAL_ALERTS
} from './src/mockData';

// ─── Persistence ─────────────────────────────────────────────────────────────

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

interface DbState {
  accounts: FinancialAccount[];
  connections: BankConnection[];
  transactions: Transaction[];
  budgets: CategoryBudget[];
  goals: FinancialGoal[];
  alerts: NotificationAlert[];
  chatHistory: ChatMessage[];
}

function loadDb(): DbState {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    }
  } catch {
    // fall through to seed defaults
  }
  return {
    accounts: structuredClone(INITIAL_ACCOUNTS),
    connections: structuredClone(INITIAL_CONNECTIONS),
    transactions: structuredClone(INITIAL_TRANSACTIONS),
    budgets: structuredClone(INITIAL_BUDGETS),
    goals: structuredClone(INITIAL_GOALS),
    alerts: structuredClone(INITIAL_ALERTS),
    chatHistory: []
  };
}

function saveDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify({
    accounts: currentAccounts,
    connections: currentConnections,
    transactions: currentTransactions,
    budgets: currentBudgets,
    goals: currentGoals,
    alerts: currentAlerts,
    chatHistory
  }, null, 2));
}

const db = loadDb();
let currentAccounts: FinancialAccount[] = db.accounts;
let currentConnections: BankConnection[] = db.connections;
let currentTransactions: Transaction[] = db.transactions;
let currentBudgets: CategoryBudget[] = db.budgets;
let currentGoals: FinancialGoal[] = db.goals;
let currentAlerts: NotificationAlert[] = db.alerts;
let chatHistory: ChatMessage[] = db.chatHistory;

// ─── Auth ─────────────────────────────────────────────────────────────────────

const APP_SECRET = process.env.APP_SECRET || 'mks-dev-secret-please-change-in-production';
const APP_PASSWORD = process.env.APP_PASSWORD || 'mks2026';
const COOKIE_NAME = 'mks_session';
const SESSION_MS = 24 * 60 * 60 * 1000;

if (!process.env.APP_SECRET) console.warn('[WARN] APP_SECRET not set — using insecure default.');
if (!process.env.APP_PASSWORD) console.warn('[WARN] APP_PASSWORD not set — using default "mks2026".');

function createToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): boolean {
  try {
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx === -1) return false;
    const payload = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const expected = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Date.now() < exp;
  } catch { return false; }
}

function parseCookies(req: express.Request): Record<string, string> {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';').filter(Boolean).map(c => {
      const i = c.indexOf('=');
      return i === -1 ? [c.trim(), ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    })
  );
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (record.count >= 5) return false;
  record.count++;
  return true;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Não autorizado. Faça login primeiro.' });
  }
  next();
}

// ─── Groq ─────────────────────────────────────────────────────────────────────

let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  if (!groqClient) {
    const key = process.env.GROQ_API_KEY;
    if (key) groqClient = new Groq({ apiKey: key });
  }
  return groqClient;
}

// ─── Budget helpers ───────────────────────────────────────────────────────────

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Only counts expenses from the current calendar month
function recalculateBudgets() {
  const month = getCurrentMonth();
  currentBudgets.forEach(b => {
    b.spentInCents = currentTransactions
      .filter(tx =>
        tx.type === 'DES' &&
        tx.category.toLowerCase() === b.category.toLowerCase() &&
        tx.date.startsWith(month)
      )
      .reduce((acc, tx) => acc + tx.amountInCents, 0);
  });
}

function checkBudgetThresholds(tx: Transaction) {
  const budget = currentBudgets.find(b => b.category.toLowerCase() === tx.category.toLowerCase());
  if (!budget) return;
  const ratioBefore = (budget.spentInCents - tx.amountInCents) / budget.limitInCents;
  const ratioAfter = budget.spentInCents / budget.limitInCents;
  const pct = Math.round(ratioAfter * 100);
  const limit = (budget.limitInCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (ratioAfter >= 1.0 && ratioBefore < 1.0) {
    currentAlerts.unshift({
      id: `alert-ovr-${Date.now()}`, type: 'WARNING', isRead: false, date: new Date().toISOString(),
      title: `🚨 Orçamento Estourado: ${budget.category}`,
      message: `Você ultrapassou 100% de gasto em ${budget.category}. Gasto: R$ ${(budget.spentInCents / 100).toFixed(2)} de ${limit}.`
    });
  } else if (ratioAfter >= 0.8 && ratioBefore < 0.8) {
    currentAlerts.unshift({
      id: `alert-warn-${Date.now()}`, type: 'WARNING', isRead: false, date: new Date().toISOString(),
      title: `⚠️ Alerta de Gastos: ${budget.category}`,
      message: `Atenção: você atingiu ${pct}% do limite de ${budget.category}. Teto: ${limit}.`
    });
  }
}

// ─── Validation constants ────────────────────────────────────────────────────

const VALID_TX_TYPES = ['REC', 'DES', 'TRANS'] as const;
const VALID_ACC_TYPES = ['CASH', 'CHECKING', 'SAVINGS', 'INVESTMENT'] as const;

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  // ── Auth routes (public) ────────────────────────────────────────────────────

  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
    const { password } = req.body;
    if (!password || password !== APP_PASSWORD) return res.status(401).json({ error: 'Senha incorreta.' });
    const token = createToken();
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}`);
    res.json({ success: true });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.json({ success: true });
  });

  app.get('/api/auth/status', (req, res) => {
    const token = parseCookies(req)[COOKIE_NAME];
    res.json({ authenticated: !!(token && verifyToken(token)) });
  });

  // ── All /api/* routes below require a valid session ─────────────────────────
  app.use('/api', requireAuth);

  // 1. GET ALL PLATFORM DATA
  app.get('/api/data', (_req, res) => {
    recalculateBudgets();
    res.json({ accounts: currentAccounts, connections: currentConnections, transactions: currentTransactions, budgets: currentBudgets, goals: currentGoals, alerts: currentAlerts, chatHistory });
  });

  // 2. CREATE TRANSACTION
  app.post('/api/transactions', (req, res) => {
    const { amountInCents, date, type, category, description, accountId, destinationAccountId } = req.body;
    if (!amountInCents || !date || !type || !category || !description || !accountId) {
      return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
    }
    if (!VALID_TX_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido. Use REC, DES ou TRANS.' });
    }
    const parsedAmount = parseInt(amountInCents, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valor deve ser inteiro positivo em centavos.' });
    }

    const newTx: Transaction = {
      id: `tx-usr-${Date.now()}`, amountInCents: parsedAmount,
      date, type, category, description, accountId, destinationAccountId, isSynced: false
    };

    const sourceAcc = currentAccounts.find(a => a.id === accountId);
    if (type === 'DES' && sourceAcc) sourceAcc.balanceInCents -= parsedAmount;
    else if (type === 'REC' && sourceAcc) sourceAcc.balanceInCents += parsedAmount;
    else if (type === 'TRANS') {
      const destAcc = currentAccounts.find(a => a.id === destinationAccountId);
      if (sourceAcc) sourceAcc.balanceInCents -= parsedAmount;
      if (destAcc) destAcc.balanceInCents += parsedAmount;
    }

    currentTransactions.unshift(newTx);
    recalculateBudgets();
    if (type === 'DES') checkBudgetThresholds(newTx);
    saveDb();
    res.status(201).json(newTx);
  });

  // 2b. DELETE TRANSACTION
  app.delete('/api/transactions/:id', (req, res) => {
    const { id } = req.params;
    const index = currentTransactions.findIndex(t => t.id === id);
    if (index === -1) return res.status(404).json({ error: 'Transação não encontrada.' });

    const [deleted] = currentTransactions.splice(index, 1);

    // Reverse the balance effect
    const sourceAcc = currentAccounts.find(a => a.id === deleted.accountId);
    if (deleted.type === 'DES' && sourceAcc) sourceAcc.balanceInCents += deleted.amountInCents;
    else if (deleted.type === 'REC' && sourceAcc) sourceAcc.balanceInCents -= deleted.amountInCents;
    else if (deleted.type === 'TRANS') {
      if (sourceAcc) sourceAcc.balanceInCents += deleted.amountInCents;
      const destAcc = currentAccounts.find(a => a.id === deleted.destinationAccountId);
      if (destAcc) destAcc.balanceInCents -= deleted.amountInCents;
    }

    recalculateBudgets();
    saveDb();
    res.json({ success: true, deleted });
  });

  // 3. CREATE ACCOUNT
  app.post('/api/accounts', (req, res) => {
    const { name, type, bankName, balanceInCents, color } = req.body;
    if (!name || !type || !bankName || balanceInCents === undefined) {
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    }
    if (!VALID_ACC_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo inválido. Use CASH, CHECKING, SAVINGS ou INVESTMENT.' });
    }
    const parsedBalance = parseInt(balanceInCents, 10);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      return res.status(400).json({ error: 'Saldo inicial deve ser não-negativo em centavos.' });
    }
    const newAcc: FinancialAccount = {
      id: `acc-usr-${Date.now()}`, name, type, bankName,
      balanceInCents: parsedBalance, color: color || '#6B7280', isLinked: false
    };
    currentAccounts.push(newAcc);
    saveDb();
    res.status(201).json(newAcc);
  });

  // 4. RESET
  app.post('/api/reset', (_req, res) => {
    currentAccounts = structuredClone(INITIAL_ACCOUNTS);
    currentConnections = structuredClone(INITIAL_CONNECTIONS);
    currentTransactions = structuredClone(INITIAL_TRANSACTIONS);
    currentBudgets = structuredClone(INITIAL_BUDGETS);
    currentGoals = structuredClone(INITIAL_GOALS);
    currentAlerts = [{
      id: `alt-reset-${Date.now()}`, title: 'Restaurado para Estado Inicial',
      message: 'Dados reiniciados com sucesso para os valores padrão.',
      type: 'SUCCESS', date: new Date().toISOString(), isRead: false
    }];
    recalculateBudgets();
    saveDb();
    res.json({ success: true });
  });

  // 5. UPDATE BUDGET LIMIT
  app.post('/api/budgets/update', (req, res) => {
    const { limitInCents, category } = req.body;
    const parsedLimit = parseInt(limitInCents, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({ error: 'Limite deve ser positivo em centavos.' });
    }
    const b = currentBudgets.find(item => item.category.toLowerCase() === category.toLowerCase());
    if (b) {
      b.limitInCents = parsedLimit;
      recalculateBudgets();
      saveDb();
      return res.json(b);
    }
    const newBudget: CategoryBudget = {
      id: `b-usr-${Date.now()}`, category, limitInCents: parsedLimit, spentInCents: 0
    };
    currentBudgets.push(newBudget);
    recalculateBudgets();
    saveDb();
    res.json(newBudget);
  });

  // 6a. DEPOSIT TO GOAL
  app.post('/api/goals/update', (req, res) => {
    const { id, amountToAdd } = req.body;
    const parsedDeposit = parseInt(amountToAdd, 10);
    if (isNaN(parsedDeposit) || parsedDeposit <= 0) {
      return res.status(400).json({ error: 'Valor do aporte deve ser positivo em centavos.' });
    }
    const goal = currentGoals.find(g => g.id === id);
    if (!goal) return res.status(404).json({ error: 'Meta não encontrada.' });
    goal.currentInCents += parsedDeposit;
    saveDb();
    res.json(goal);
  });

  // 6b. CREATE GOAL
  app.post('/api/goals', (req, res) => {
    const { name, targetInCents, targetDate, color, currentInCents } = req.body;
    if (!name || isNaN(targetInCents) || targetInCents <= 0 || !targetDate) {
      return res.status(400).json({ error: 'Parâmetros inválidos para criação da meta.' });
    }
    const newGoal: FinancialGoal = {
      id: `g-usr-${Date.now()}`, name,
      targetInCents: parseInt(targetInCents, 10),
      currentInCents: currentInCents ? parseInt(currentInCents, 10) : 0,
      targetDate, color: color || '#6366F1'
    };
    currentGoals.push(newGoal);
    saveDb();
    res.json(newGoal);
  });

  // 6c. DELETE GOAL
  app.delete('/api/goals/:id', (req, res) => {
    const { id } = req.params;
    const index = currentGoals.findIndex(g => g.id === id);
    if (index === -1) return res.status(404).json({ error: 'Meta não encontrada.' });
    const [deleted] = currentGoals.splice(index, 1);
    saveDb();
    res.json({ success: true, deleted });
  });

  // 7. MARK ALERT READ
  app.post('/api/alerts/read', (req, res) => {
    const { id } = req.body;
    const alert = currentAlerts.find(a => a.id === id);
    if (alert) { alert.isRead = true; saveDb(); }
    res.json({ success: true });
  });

  // 8. OPEN FINANCE SYNC SIMULATOR
  app.post('/api/open-finance/connect', (req, res) => {
    const { bankName } = req.body;
    if (!bankName) return res.status(400).json({ error: 'Selecione uma instituição bancária.' });

    let conn = currentConnections.find(c => c.institutionName.toLowerCase() === bankName.toLowerCase());
    if (!conn) {
      conn = {
        id: `conn-bank-${Date.now()}`, institutionName: bankName, logo: '⚡', status: 'SYNCING',
        itemId: `plg_${bankName.replace(/\s+/g, '').toLowerCase()}_${Math.floor(1000 + Math.random() * 9000)}`
      };
      currentConnections.push(conn);
    } else {
      conn.status = 'SYNCING';
    }

    const mockTxns = [
      { desc: 'RESTAURANTE ASSIS BURGER', amount: 8450, category: 'Alimentação' },
      { desc: 'AUTO POSTO IPIRANGA', amount: 15000, category: 'Transporte' },
      { desc: 'MERCADO DISTRITO LTDA', amount: 21020, category: 'Alimentação' },
      { desc: 'CORTE FEITO BARBEARIA', amount: 6500, category: 'Outros' },
      { desc: 'CURSO INGLÊS COMPLETO', amount: 18000, category: 'Educação' },
    ];

    setTimeout(() => {
      const c = currentConnections.find(c => c.institutionName.toLowerCase() === bankName.toLowerCase());
      if (!c) return;
      c.status = 'CONNECTED';
      c.lastSyncedAt = new Date().toISOString();

      let targetAcc = currentAccounts.find(a => a.bankName.toLowerCase() === bankName.toLowerCase());
      if (!targetAcc) {
        targetAcc = {
          id: `acc-auto-${Date.now()}`, name: `Conta Corrente ${bankName}`, type: 'CHECKING',
          bankName, balanceInCents: 1200000, color: '#3B82F6', isLinked: true
        };
        currentAccounts.push(targetAcc);
      } else {
        targetAcc.isLinked = true;
      }

      let synced = 0;
      for (const item of mockTxns) {
        const d = new Date();
        d.setDate(d.getDate() - Math.floor(Math.random() * 10));
        currentTransactions.unshift({
          id: `tx-sync-${Math.random().toString(36).slice(2, 11)}`,
          amountInCents: item.amount, date: d.toISOString().split('T')[0],
          type: 'DES', category: item.category, description: item.desc,
          accountId: targetAcc!.id, isSynced: true, originalMerchantName: item.desc
        });
        targetAcc!.balanceInCents -= item.amount;
        synced++;
      }

      recalculateBudgets();
      currentAlerts.unshift({
        id: `alert-conn-${Date.now()}`, type: 'SUCCESS', isRead: false, date: new Date().toISOString(),
        title: `🔗 Conexão Bem-sucedida: ${bankName}`,
        message: `${synced} transações sincronizadas e categorizadas com sucesso.`
      });
      saveDb();
    }, 4000);

    res.json({ success: true, status: 'SYNCING', itemId: conn.itemId });
  });

  // 9. AI ADVISOR — Groq llama-3.3-70b-versatile
  app.post('/api/groq/advisor', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem obrigatória.' });

    const client = getGroqClient();
    recalculateBudgets();

    const totalBalance = currentAccounts.reduce((s, a) => s + a.balanceInCents, 0);
    const budgetSummary = currentBudgets.map(b =>
      `${b.category}: R$ ${(b.spentInCents / 100).toFixed(2)} gastos de R$ ${(b.limitInCents / 100).toFixed(2)}`
    ).join(', ');
    const goalsSummary = currentGoals.map(g =>
      `${g.name}: R$ ${(g.currentInCents / 100).toFixed(2)} de R$ ${(g.targetInCents / 100).toFixed(2)}`
    ).join(', ');

    const systemPrompt = `Você é um Consultor Financeiro de elite para brasileiros. Seja cortês, preciso e empático.
Contexto financeiro atual do usuário:
- Patrimônio Total: R$ ${(totalBalance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Orçamentos do mês: ${budgetSummary}
- Metas de poupança: ${goalsSummary}
- Total de transações: ${currentTransactions.length}

REGRAS: Não critique despesas agressivamente. Retorne Markdown rico e bem estruturado.
Responda com no máximo 3 parágrafos ou bullet points acionáveis.`;

    if (!client) {
      await new Promise(r => setTimeout(r, 600));
      return res.json({
        reply: `### 💡 Análise MKS Open Finance\n\nSeu patrimônio consolidado é **R$ ${(totalBalance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**.\n\n> Configure GROQ_API_KEY no .env para respostas personalizadas com IA.`,
        note: 'Groq API key não configurada'
      });
    }

    try {
      const response = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1024
      });
      res.json({ reply: response.choices[0]?.message?.content || 'Sem resposta do modelo.' });
    } catch (e: any) {
      res.status(500).json({ error: 'Erro ao invocar Groq AI', details: e.message });
    }
  });

  // 10. AUTO-CATEGORIZATION — Groq llama-3.1-8b-instant
  app.post('/api/groq/categorize', async (req, res) => {
    const { merchantName } = req.body;
    if (!merchantName) return res.status(400).json({ error: 'merchantName obrigatório.' });

    const client = getGroqClient();

    // Fallback regex classifier
    const classifyLocally = (name: string) => {
      const l = name.toLowerCase();
      let category = 'Outros', cleanDesc = name;
      if (/mercado|supermercado|pao de acucar|burger|restaurante|coco bambu|jantar|lanche/.test(l)) category = 'Alimentação';
      else if (/uber|posto|combustiv|gasolina|estacion/.test(l)) category = 'Transporte';
      else if (/aluguel|imovel|loft|condomin/.test(l)) category = 'Moradia';
      else if (/netflix|cinema|spotify|ingresso|streaming/.test(l)) category = 'Lazer';
      else if (/drogaria|farmacia|saude|medico|clinica|plano/.test(l)) category = 'Saúde';
      else if (/livro|curso|escola|facul|ingles|idioma/.test(l)) category = 'Educação';
      if (/pao de acucar/.test(l)) cleanDesc = 'Supermercado Pão de Açúcar';
      else if (/coco bambu/.test(l)) cleanDesc = 'Restaurante Coco Bambu';
      else if (/netflix/.test(l)) cleanDesc = 'Netflix';
      else if (/uber/.test(l)) cleanDesc = 'Uber';
      else if (/posto ipiranga/.test(l)) cleanDesc = 'Posto Ipiranga';
      return { cleanDescription: cleanDesc, category };
    };

    if (!client) return res.json(classifyLocally(merchantName));

    try {
      const response = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'user',
          content: `Transação bancária: "${merchantName}". Retorne JSON com "cleanDescription" (nome amigável) e "category" (uma de: Alimentação, Transporte, Moradia, Lazer, Saúde, Educação, Outros).`
        }],
        temperature: 0.1,
        max_tokens: 100,
        response_format: { type: 'json_object' }
      });
      const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
      res.json({ cleanDescription: parsed.cleanDescription || merchantName, category: parsed.category || 'Outros' });
    } catch {
      res.json(classifyLocally(merchantName));
    }
  });

  // 11. VITE / SPA
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MKS Open Finance server → http://0.0.0.0:${PORT}`);
    if (!process.env.GROQ_API_KEY) console.warn('[WARN] GROQ_API_KEY não configurada — IA em modo fallback.');
  });
}

startServer();
