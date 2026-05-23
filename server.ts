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
import { GoogleGenAI } from '@google/genai';
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

// ─── Persistence ────────────────────────────────────────────────────────────

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

// Initialize state from disk (or seed from mockData on first run)
const db = loadDb();
let currentAccounts: FinancialAccount[] = db.accounts;
let currentConnections: BankConnection[] = db.connections;
let currentTransactions: Transaction[] = db.transactions;
let currentBudgets: CategoryBudget[] = db.budgets;
let currentGoals: FinancialGoal[] = db.goals;
let currentAlerts: NotificationAlert[] = db.alerts;
let chatHistory: ChatMessage[] = db.chatHistory;

// ─── Auth ────────────────────────────────────────────────────────────────────

const APP_SECRET = process.env.APP_SECRET || 'mks-dev-secret-please-change-in-production';
const APP_PASSWORD = process.env.APP_PASSWORD || 'mks2026';
const COOKIE_NAME = 'mks_session';
const SESSION_MS = 24 * 60 * 60 * 1000; // 24 h

if (!process.env.APP_SECRET) {
  console.warn('[WARN] APP_SECRET not set — using insecure default. Set APP_SECRET in .env for production.');
}
if (!process.env.APP_PASSWORD) {
  console.warn('[WARN] APP_PASSWORD not set — using default password "mks2026". Set APP_PASSWORD in .env.');
}

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
  } catch {
    return false;
  }
}

function parseCookies(req: express.Request): Record<string, string> {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';').filter(Boolean).map(c => {
      const i = c.indexOf('=');
      return i === -1 ? [c.trim(), ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    })
  );
}

// Simple in-memory rate limiter: 5 attempts per 15 minutes per IP
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

// ─── Gemini ──────────────────────────────────────────────────────────────────

let geminiAIClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!geminiAIClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== 'MY_GEMINI_API_KEY') {
      geminiAIClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });
    }
  }
  return geminiAIClient;
}

// ─── Budget helpers ───────────────────────────────────────────────────────────

function recalculateBudgets() {
  currentBudgets.forEach(b => {
    b.spentInCents = currentTransactions
      .filter(tx => tx.type === 'DES' && tx.category.toLowerCase() === b.category.toLowerCase())
      .reduce((acc, tx) => acc + tx.amountInCents, 0);
  });
}

function checkBudgetThresholds(tx: Transaction) {
  const budget = currentBudgets.find(b => b.category.toLowerCase() === tx.category.toLowerCase());
  if (!budget) return;
  const ratioBefore = (budget.spentInCents - tx.amountInCents) / budget.limitInCents;
  const ratioAfter = budget.spentInCents / budget.limitInCents;
  const percentText = Math.round(ratioAfter * 100);
  const limitFormatted = (budget.limitInCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (ratioAfter >= 1.0 && ratioBefore < 1.0) {
    currentAlerts.unshift({
      id: `alert-ovr-${Date.now()}`,
      title: `🚨 Orçamento Estourado: ${budget.category}`,
      message: `Você ultrapassou 100% de gasto em ${budget.category}. Gasto atual: R$ ${(budget.spentInCents / 100).toFixed(2)} de ${limitFormatted}.`,
      type: 'WARNING', date: new Date().toISOString(), isRead: false
    });
  } else if (ratioAfter >= 0.8 && ratioBefore < 0.8) {
    currentAlerts.unshift({
      id: `alert-warn-${Date.now()}`,
      title: `⚠️ Alerta de Gastos: ${budget.category}`,
      message: `Atenção: você atingiu ${percentText}% do limite de ${budget.category}. Teto: ${limitFormatted}.`,
      type: 'WARNING', date: new Date().toISOString(), isRead: false
    });
  }
}

// ─── Server ───────────────────────────────────────────────────────────────────

const VALID_TX_TYPES = ['REC', 'DES', 'TRANS'] as const;
const VALID_ACC_TYPES = ['CASH', 'CHECKING', 'SAVINGS', 'INVESTMENT'] as const;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ── Auth routes (public — registered before requireAuth middleware) ──────────

  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' });
    }
    const { password } = req.body;
    if (!password || password !== APP_PASSWORD) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
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

  // ── All /api/* routes below require a valid session ────────────────────────
  app.use('/api', requireAuth);

  // 1. GET ALL PLATFORM DATA
  app.get('/api/data', (req, res) => {
    recalculateBudgets();
    res.json({ accounts: currentAccounts, connections: currentConnections, transactions: currentTransactions, budgets: currentBudgets, goals: currentGoals, alerts: currentAlerts, chatHistory });
  });

  // 2. CREATE TRANSACTION MANUALLY
  app.post('/api/transactions', (req, res) => {
    const { amountInCents, date, type, category, description, accountId, destinationAccountId } = req.body;

    if (!amountInCents || !date || !type || !category || !description || !accountId) {
      return res.status(400).json({ error: 'Missing parameters. Ensure all fields are filled.' });
    }
    if (!VALID_TX_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo de transação inválido. Use REC, DES ou TRANS.' });
    }
    const parsedAmount = parseInt(amountInCents, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'O valor deve ser um número inteiro positivo em centavos.' });
    }

    const newTx: Transaction = {
      id: `tx-usr-${Date.now()}`,
      amountInCents: parsedAmount,
      date,
      type,
      category,
      description,
      accountId,
      destinationAccountId,
      isSynced: false
    };

    const sourceAcc = currentAccounts.find(a => a.id === accountId);
    if (type === 'DES' && sourceAcc) {
      sourceAcc.balanceInCents -= parsedAmount;
    } else if (type === 'REC' && sourceAcc) {
      sourceAcc.balanceInCents += parsedAmount;
    } else if (type === 'TRANS') {
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

  // 3. CREATE ACCOUNT WALLET
  app.post('/api/accounts', (req, res) => {
    const { name, type, bankName, balanceInCents, color } = req.body;

    if (!name || !type || !bankName || balanceInCents === undefined) {
      return res.status(400).json({ error: 'Complete all required details.' });
    }
    if (!VALID_ACC_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo de conta inválido. Use CASH, CHECKING, SAVINGS ou INVESTMENT.' });
    }
    const parsedBalance = parseInt(balanceInCents, 10);
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      return res.status(400).json({ error: 'Saldo inicial deve ser um número não-negativo em centavos.' });
    }

    const newAcc: FinancialAccount = {
      id: `acc-usr-${Date.now()}`,
      name,
      type,
      bankName,
      balanceInCents: parsedBalance,
      color: color || '#6B7280',
      isLinked: false
    };

    currentAccounts.push(newAcc);
    saveDb();
    res.status(201).json(newAcc);
  });

  // 4. RESET TO INITIAL SEED STATE
  app.post('/api/reset', (req, res) => {
    currentAccounts = structuredClone(INITIAL_ACCOUNTS);
    currentConnections = structuredClone(INITIAL_CONNECTIONS);
    currentTransactions = structuredClone(INITIAL_TRANSACTIONS);
    currentBudgets = structuredClone(INITIAL_BUDGETS);
    currentGoals = structuredClone(INITIAL_GOALS);
    currentAlerts = [{
      id: `alt-reset-${Date.now()}`,
      title: 'Restaurado para Estado Inicial',
      message: 'Dados financeiros reiniciados com sucesso para os valores padrão de auditoria.',
      type: 'SUCCESS',
      date: new Date().toISOString(),
      isRead: false
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
      return res.status(400).json({ error: 'Limite deve ser um valor positivo em centavos.' });
    }
    const b = currentBudgets.find(item => item.category.toLowerCase() === category.toLowerCase());
    if (b) {
      b.limitInCents = parsedLimit;
      recalculateBudgets();
      saveDb();
      return res.json(b);
    }
    const newBudget: CategoryBudget = {
      id: `b-usr-${Date.now()}`,
      category,
      limitInCents: parsedLimit,
      spentInCents: 0
    };
    currentBudgets.push(newBudget);
    recalculateBudgets();
    saveDb();
    res.json(newBudget);
  });

  // 6. UPDATE FINANCIAL GOAL (deposit)
  app.post('/api/goals/update', (req, res) => {
    const { id, amountToAdd } = req.body;
    const parsedDeposit = parseInt(amountToAdd, 10);
    if (isNaN(parsedDeposit) || parsedDeposit <= 0) {
      return res.status(400).json({ error: 'Valor do aporte deve ser um número positivo em centavos.' });
    }
    const goal = currentGoals.find(g => g.id === id);
    if (goal) {
      goal.currentInCents += parsedDeposit;
      saveDb();
      return res.json(goal);
    }
    res.status(404).json({ error: 'Meta não encontrada' });
  });

  // 6b. CREATE FINANCIAL GOAL
  app.post('/api/goals', (req, res) => {
    const { name, targetInCents, targetDate, color, currentInCents } = req.body;
    if (!name || isNaN(targetInCents) || targetInCents <= 0 || !targetDate) {
      return res.status(400).json({ error: 'Parâmetros inválidos para criação da meta' });
    }
    const newGoal: FinancialGoal = {
      id: `g-usr-${Date.now()}`,
      name,
      targetInCents: parseInt(targetInCents, 10),
      currentInCents: currentInCents ? parseInt(currentInCents, 10) : 0,
      targetDate,
      color: color || '#6366F1'
    };
    currentGoals.push(newGoal);
    saveDb();
    res.json(newGoal);
  });

  // 6c. DELETE FINANCIAL GOAL
  app.delete('/api/goals/:id', (req, res) => {
    const { id } = req.params;
    const index = currentGoals.findIndex(g => g.id === id);
    if (index !== -1) {
      const deleted = currentGoals.splice(index, 1);
      saveDb();
      return res.json({ success: true, deleted: deleted[0] });
    }
    res.status(404).json({ error: 'Meta não encontrada' });
  });

  // 7. MARK ALERT AS READ
  app.post('/api/alerts/read', (req, res) => {
    const { id } = req.body;
    const alert = currentAlerts.find(a => a.id === id);
    if (alert) {
      alert.isRead = true;
      saveDb();
    }
    res.json({ success: true });
  });

  // 8. SIMULATOR: BANK OPEN FINANCE CONNECTION & SYNC QUEUE
  app.post('/api/open-finance/connect', async (req, res) => {
    const { bankName } = req.body;
    if (!bankName) {
      return res.status(400).json({ error: 'Select a valid banking institution' });
    }

    let existingConn = currentConnections.find(c => c.institutionName.toLowerCase() === bankName.toLowerCase());
    if (!existingConn) {
      existingConn = {
        id: `conn-bank-${Date.now()}`,
        institutionName: bankName,
        logo: '⚡',
        status: 'SYNCING',
        itemId: `plg_${bankName.replace(/\s+/g, '').toLowerCase()}_${Math.floor(1000 + Math.random() * 9000)}`
      };
      currentConnections.push(existingConn);
    } else {
      existingConn.status = 'SYNCING';
    }

    const mockExternalBankTransactions = [
      { desc: 'RESTAURANTE ASSIS BURGER', amount: 8450, category: 'Alimentação' },
      { desc: 'AUTO POSTO IPIRANGA', amount: 15000, category: 'Transporte' },
      { desc: 'MERCADO DISTRITO LTDA', amount: 21020, category: 'Alimentação' },
      { desc: 'CORTE FEITO BARBEARIA', amount: 6500, category: 'Outros' },
      { desc: 'CURSO INGLÊS COMPLETO', amount: 18000, category: 'Educação' },
    ];

    setTimeout(() => {
      const conn = currentConnections.find(c => c.institutionName.toLowerCase() === bankName.toLowerCase());
      if (!conn) return;
      conn.status = 'CONNECTED';
      conn.lastSyncedAt = new Date().toISOString();

      let targetAcc = currentAccounts.find(a => a.bankName.toLowerCase() === bankName.toLowerCase());
      if (!targetAcc) {
        targetAcc = {
          id: `acc-auto-${Date.now()}`,
          name: `Conta Corrente ${bankName}`,
          type: 'CHECKING',
          bankName,
          balanceInCents: 1200000,
          color: '#3B82F6',
          isLinked: true
        };
        currentAccounts.push(targetAcc);
      } else {
        targetAcc.isLinked = true;
      }

      let syncedCount = 0;
      for (const item of mockExternalBankTransactions) {
        const dateRandom = new Date();
        dateRandom.setDate(dateRandom.getDate() - Math.floor(Math.random() * 10));
        const finalTx: Transaction = {
          id: `tx-sync-${Math.random().toString(36).substr(2, 9)}`,
          amountInCents: item.amount,
          date: dateRandom.toISOString().split('T')[0],
          type: 'DES',
          category: item.category,
          description: item.desc,
          accountId: targetAcc!.id,
          isSynced: true,
          originalMerchantName: item.desc
        };
        currentTransactions.unshift(finalTx);
        targetAcc!.balanceInCents -= item.amount;
        syncedCount++;
      }

      recalculateBudgets();
      currentAlerts.unshift({
        id: `alert-conn-${Date.now()}`,
        title: `🔗 Conexão Bem-sucedida: ${bankName}`,
        message: `Sincronização histórica automatizada concluída para ${bankName}! ${syncedCount} transações consolidadas e categorizadas com sucesso.`,
        type: 'SUCCESS', date: new Date().toISOString(), isRead: false
      });
      saveDb();
    }, 4000);

    res.json({
      success: true,
      status: 'SYNCING',
      message: 'Tarefa sync-historical-data enfileirada. Processando histórico bancário de 90 dias.',
      itemId: existingConn.itemId
    });
  });

  // 9. CLIENT ADVISOR WITH SERVER-SIDE GEMINI AI API PROXY
  app.post('/api/gemini/advisor', async (req, res) => {
    const { message } = req.body;
    const client = getGeminiClient();
    recalculateBudgets();
    const totalBalance = currentAccounts.reduce((sum, a) => sum + a.balanceInCents, 0);
    const totalTransactions = currentTransactions.length;
    const budgetSummary = currentBudgets.map(b => `${b.category}: R$ ${(b.spentInCents / 100).toFixed(2)} gastos de R$ ${(b.limitInCents / 100).toFixed(2)}`).join(', ');
    const activeGoals = currentGoals.map(g => `${g.name}: R$ ${(g.currentInCents / 100).toFixed(2)} de R$ ${(g.targetInCents / 100).toFixed(2)}`).join(', ');

    const systemPrompt = `Você é um Consultor Financeiro de elite especializado em finanças pessoais para brasileiros.
Você é extremamente cortês, preciso, fala em Português do Brasil de forma empática e profissional.
As finanças atuais do usuário são:
- Saldo Patrimonial Total: R$ ${(totalBalance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Mapeamento de Orçamentos Atuais por categoria: ${budgetSummary}
- Alvo de Metas e Poupança: ${activeGoals}
- Quantidade de Transações Registradas: ${totalTransactions}

REGRAS DE CONVENÇÃO:
- Não critique as despesas do usuário de forma agressiva. Ofereça insights construtivos específicos para a realidade dele.
- Retorne apenas Markdown rico e bem estruturado com seções e destaque em negrito.
- Nunca retorne código nem dados simulados de porta do servidor. Fale diretamente como um ser humano especialista.
- Responda apenas à pergunta ou dê conselho de planejamento com no máximo 3 pequenos parágrafos focados ou bullet points acionáveis.`;

    if (!client) {
      const fallbackReplies = [
        "### 💡 Análise de Saúde Financeira MKS\n\nExcelente controle! Seu patrimônio atual consolidado de **R$ " + (totalBalance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + "** demonstra excelente consistência.\n\n" +
        "#### Próximos Passos Recomendados:\n" +
        "1. **Segurança**: Sua **Reserva de Emergência** está em **" + Math.round((currentGoals[0]?.currentInCents / currentGoals[0]?.targetInCents) * 100) + "%** do objetivo.\n" +
        "2. **Ajuste de Categoria**: Você já registrou despesas na categoria **Moradia** correspondendo a maior parcela do seu orçamento fixo.\n" +
        "3. **Open Finance Ativo**: Excelente integração com Banco Itaú e Inter. Isto garante que novos lançamentos entrarão de forma automática.",
        "### 📈 Planejamento de Metas de Curto Prazo\n\nAnalisando suas economias, sua carteira possui boas frentes de investimento.\n\n" +
        "- **Meta Japão**: Atualmente com **R$ " + (currentGoals[1]?.currentInCents / 100).toLocaleString('pt-BR') + "** poupados do total de R$ " + (currentGoals[1]?.targetInCents / 100).toLocaleString('pt-BR') + ".\n" +
        "- **Sugestão de Economia Inteligente**: Se você reduzir os gastos de *Lazer* e *Alimentação em 10%* nas próximas duas semanas, poderá antecipar seu objetivo em cerca de 45 dias!",
      ];
      const selectedReply = message.toLowerCase().includes('viagem') || message.toLowerCase().includes('meta') ? fallbackReplies[1] : fallbackReplies[0];
      await new Promise(resolve => setTimeout(resolve, 800));
      return res.json({ reply: selectedReply, note: 'Análise processada localmente devido a chave offline' });
    }

    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: message,
        config: { systemInstruction: systemPrompt, temperature: 0.7 }
      });
      res.json({ reply: response.text || 'Desculpe, não consegui consolidar a resposta analítica no momento.' });
    } catch (e: any) {
      res.status(500).json({ error: 'Erro ao invocar Gemini AI no servidor', details: e.message });
    }
  });

  // 10. GEMINI AUTO-CATEGORIZATION ENDPOINT FOR STATEMENTS
  app.post('/api/gemini/categorize', async (req, res) => {
    const { merchantName } = req.body;
    if (!merchantName) {
      return res.status(400).json({ error: 'Merchant name is required' });
    }
    const client = getGeminiClient();
    if (!client) {
      const lower = merchantName.toLowerCase();
      let category = 'Outros';
      let cleanDesc = merchantName;
      if (lower.includes('pao de acucar') || lower.includes('mercado') || lower.includes('burger') || lower.includes('restaurante') || lower.includes('coco bambu') || lower.includes('jantar')) category = 'Alimentação';
      else if (lower.includes('uber') || lower.includes('posto') || lower.includes('combustivel') || lower.includes('carro')) category = 'Transporte';
      else if (lower.includes('aluguel') || lower.includes('imovel') || lower.includes('loft') || lower.includes('condominio')) category = 'Moradia';
      else if (lower.includes('netflix') || lower.includes('cinema') || lower.includes('spotify') || lower.includes('ingresso')) category = 'Lazer';
      else if (lower.includes('drogaria') || lower.includes('saude') || lower.includes('farmacia') || lower.includes('medico')) category = 'Saúde';
      else if (lower.includes('livro') || lower.includes('curso') || lower.includes('escola') || lower.includes('ingles')) category = 'Educação';
      if (lower.includes('uber')) cleanDesc = 'Uber Viagem';
      else if (lower.includes('pao de acucar')) cleanDesc = 'Supermercado Pão de Açúcar';
      else if (lower.includes('coco bambu')) cleanDesc = 'Restaurante Coco Bambu';
      else if (lower.includes('netflix')) cleanDesc = 'Assinatura Mensal Netflix';
      else if (lower.includes('aluguel')) cleanDesc = 'Aluguel Loft Paulista';
      else if (lower.includes('posto ipiranga')) cleanDesc = 'Posto Ipiranga Combustível';
      return res.json({ cleanDescription: cleanDesc, category });
    }
    try {
      const gPrompt = `Dado o nome bruto da transação bancária: "${merchantName}".
Retorne JSON com duas propriedades:
"cleanDescription": nome humanizado (ex: "PAO DE ACUCAR SP LOJAS" → "Supermercado Pão de Açúcar").
"category": exatamente uma de: "Alimentação", "Transporte", "Moradia", "Lazer", "Saúde", "Educação", "Outros".`;
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: gPrompt,
        config: { responseMimeType: 'application/json', temperature: 0.1 }
      });
      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json({ cleanDescription: parsed.cleanDescription || merchantName, category: parsed.category || 'Outros' });
    } catch {
      res.json({ cleanDescription: merchantName, category: 'Outros' });
    }
  });

  // 11. VITE MIDDLEWARE / SPA FALLBACKS
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Open Finance server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
