/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import Groq from 'groq-sdk';
import {
  FinancialAccount,
  Transaction,
  BankConnection,
  CategoryBudget,
  FinancialGoal,
  NotificationAlert,
  ChatMessage,
  Category,
  CreditCard,
  Invoice,
  Recurrence,
  FamilyMember,
  InstallmentGroup
} from './src/types';
import {
  INITIAL_ACCOUNTS,
  INITIAL_CONNECTIONS,
  INITIAL_TRANSACTIONS,
  INITIAL_BUDGETS,
  INITIAL_GOALS,
  INITIAL_ALERTS
} from './src/mockData';

// ─── Cloudflare D1 + R2 ──────────────────────────────────────────────────────

const CF_ACCOUNT_ID = '9b61f609fee4408fd1c4344feaf9b16a';
const D1_DATABASE_ID = '06790b84-c635-4111-918d-cbdad49a2f29';
const R2_BUCKET = 'mks-finance-storage';
const WRANGLER_CONFIG = path.join(os.homedir(), '.config/.wrangler/config/default.toml');

let tokenCache: { value: string; expiresAt: number } | null = null;

function readWranglerToken(): { value: string; expiresAt: number } | null {
  try {
    const raw = fs.readFileSync(WRANGLER_CONFIG, 'utf-8');
    const tokenMatch = raw.match(/oauth_token = "([^"]+)"/);
    const expMatch = raw.match(/expiration_time = "([^"]+)"/);
    if (!tokenMatch) return null;
    return {
      value: tokenMatch[1],
      expiresAt: expMatch ? new Date(expMatch[1]).getTime() : Date.now() + 300_000
    };
  } catch { return null; }
}

async function getCFToken(): Promise<string> {
  // Permanent API token (preferred for production)
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;

  // In-memory cache still valid
  if (tokenCache && Date.now() < tokenCache.expiresAt - 30_000) return tokenCache.value;

  // Read fresh token from wrangler config (wrangler keeps it up-to-date)
  const fromFile = readWranglerToken();
  if (fromFile && Date.now() < fromFile.expiresAt - 30_000) {
    tokenCache = fromFile;
    return tokenCache.value;
  }

  throw new Error('CF token expirado. Configure CLOUDFLARE_API_TOKEN no .env ou execute: npx wrangler login');
}

async function d1q<T = any>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
  const token = await getCFToken();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params })
    }
  );
  const data = await res.json() as any;
  if (!data.success) throw new Error(data.errors?.[0]?.message || 'D1 error: ' + JSON.stringify(data.errors));
  return (data.result?.[0]?.results || []) as T[];
}

// D1 REST API has no batch endpoint — execute all statements in parallel
async function d1exec(stmts: { sql: string; params?: (string | number | null)[] }[]): Promise<void> {
  await Promise.all(stmts.map(s => d1q(s.sql, s.params || [])));
}

async function r2Put(key: string, body: string): Promise<void> {
  try {
    const token = await getCFToken();
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(key)}`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body
      }
    );
  } catch (e) {
    console.error('[R2] Upload failed:', e);
  }
}

async function r2PutBinary(key: string, buffer: Buffer, contentType: string): Promise<void> {
  try {
    const token = await getCFToken();
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(key)}`,
      { method: 'PUT', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': contentType }, body: buffer as unknown as BodyInit }
    );
  } catch (e) { console.error('[R2] Binary upload failed:', e); }
}

async function r2GetBinary(key: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  try {
    const token = await getCFToken();
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(key)}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    return { body: await res.arrayBuffer(), contentType: res.headers.get('content-type') || 'application/octet-stream' };
  } catch { return null; }
}

// ─── Shared classifier ────────────────────────────────────────────────────────

function classifyMerchant(desc: string): string {
  const l = desc.toLowerCase();
  if (/mercado|supermercado|padaria|burger|restaurante|lanche|ifood|rappi|pizza|aliment|açougue|hortifruti/.test(l)) return 'Alimentação';
  if (/uber|99taxi|taxi|posto|combustiv|gasolina|estacion|onibus|metro|transporte|pedágio|pedagio/.test(l)) return 'Transporte';
  if (/aluguel|imovel|condomin|agua|luz|energia|internet|telefone|gas|gás|claro|vivo|tim|oi/.test(l)) return 'Moradia';
  if (/netflix|cinema|spotify|ingresso|streaming|lazer|viagem|hotel|airbnb|booking/.test(l)) return 'Lazer';
  if (/farmacia|drogaria|saude|medico|clinica|plano|hospital|dentist|unimed|amil/.test(l)) return 'Saúde';
  if (/livro|curso|escola|facul|inglês|ingles|idioma|educacao|educação|udemy|alura/.test(l)) return 'Educação';
  if (/roupa|vestuário|vestuario|moda|fashion|zara|renner|hering|centauro|sport|academia|gym/.test(l)) return 'Vestuário';
  if (/salario|salário|pagamento|renda|freelance|pix recebido|transferencia recebida/.test(l)) return 'Receita';
  return 'Outros';
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function mapAccount(r: any): FinancialAccount {
  return { id: r.id, name: r.name, type: r.type, bankName: r.bank_name, balanceInCents: r.balance_in_cents, color: r.color, isLinked: !!r.is_linked };
}
function mapTransaction(r: any): Transaction {
  return {
    id: r.id, amountInCents: r.amount_in_cents, date: r.date, type: r.type,
    category: r.category, description: r.description, accountId: r.account_id,
    destinationAccountId: r.destination_account_id || undefined,
    isSynced: !!r.is_synced, originalMerchantName: r.original_merchant_name || undefined,
    creditCardId: r.credit_card_id || undefined, invoiceId: r.invoice_id || undefined,
    installmentNumber: r.installment_number || undefined, installmentTotal: r.installment_total || undefined,
    installmentGroupId: r.installment_group_id || undefined,
    documentKey: r.document_key || undefined,
    memberId: r.member_id || undefined,
  };
}
function mapCategory(r: any): Category {
  return { id: r.id, name: r.name, parentId: r.parent_id || null, icon: r.icon, color: r.color, type: r.type };
}
function mapCreditCard(r: any): CreditCard {
  return { id: r.id, name: r.name, bankName: r.bank_name, lastFour: r.last_four || null, limitInCents: r.limit_in_cents, billingDay: r.billing_day, dueDay: r.due_day, color: r.color, isActive: !!r.is_active };
}
function mapInvoice(r: any): Invoice {
  return { id: r.id, creditCardId: r.credit_card_id, month: r.month, totalInCents: r.total_in_cents, status: r.status, dueDate: r.due_date || null, paidAt: r.paid_at || null, createdAt: r.created_at };
}
function mapRecurrence(r: any): Recurrence {
  return {
    id: r.id, description: r.description, amountInCents: r.amount_in_cents,
    type: r.type, category: r.category, accountId: r.account_id || null,
    creditCardId: r.credit_card_id || null, frequency: r.frequency,
    dayOfMonth: r.day_of_month || null, startDate: r.start_date,
    endDate: r.end_date || null, lastGeneratedDate: r.last_generated_date || null,
    isActive: !!r.is_active, createdAt: r.created_at,
  };
}
function mapBudget(r: any): CategoryBudget {
  return { id: r.id, category: r.category, limitInCents: r.limit_in_cents, spentInCents: r.spent_in_cents };
}
function mapGoal(r: any): FinancialGoal {
  return { id: r.id, name: r.name, targetInCents: r.target_in_cents, currentInCents: r.current_in_cents, targetDate: r.target_date, color: r.color };
}
function mapAlert(r: any): NotificationAlert {
  return { id: r.id, type: r.type, title: r.title, message: r.message, date: r.date, isRead: !!r.is_read };
}
function mapConnection(r: any): BankConnection {
  return { id: r.id, institutionName: r.institution_name, logo: r.logo, status: r.status, itemId: r.item_id || undefined, lastSyncedAt: r.last_synced_at || undefined };
}
function mapChat(r: any): ChatMessage {
  return { id: r.id, sender: r.sender, text: r.text, timestamp: r.timestamp };
}
function mapFamilyMember(r: any): FamilyMember {
  return { id: r.id, name: r.name, avatarColor: r.avatar_color, createdAt: r.created_at };
}
function mapInstallmentGroup(r: any, paidCount: number): InstallmentGroup {
  return {
    id: r.id, description: r.description, totalInCents: r.total_in_cents,
    installmentCount: r.installment_count, installmentAmountInCents: r.installment_amount_in_cents,
    category: r.category, accountId: r.account_id || null, creditCardId: r.credit_card_id || null,
    memberId: r.member_id || null, startDate: r.start_date, createdAt: r.created_at, paidCount,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

const APP_SECRET = process.env.APP_SECRET || 'mks-dev-secret-please-change-in-production';
const APP_PASSWORD = process.env.APP_PASSWORD || 'mks2026';
const COOKIE_NAME = 'mks_session';
const SESSION_MS = 24 * 60 * 60 * 1000;

if (!process.env.APP_SECRET) console.warn('[WARN] APP_SECRET não configurado — usando valor padrão inseguro.');
if (!process.env.APP_PASSWORD) console.warn('[WARN] APP_PASSWORD não configurado — usando "mks2026".');

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
  const rec = loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) { loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 }); return true; }
  if (rec.count >= 5) return false;
  rec.count++;
  return true;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token || !verifyToken(token)) return res.status(401).json({ error: 'Não autorizado. Faça login primeiro.' });
  next();
}

// ─── Groq ─────────────────────────────────────────────────────────────────────

let groqClient: Groq | null = null;
function getGroqClient(): Groq | null {
  if (!groqClient && process.env.GROQ_API_KEY) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

// ─── Budget helpers ───────────────────────────────────────────────────────────

function getCurrentMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

async function recalculateBudgets(): Promise<void> {
  await d1q(`
    UPDATE budgets
    SET spent_in_cents = (
      SELECT COALESCE(SUM(t.amount_in_cents), 0)
      FROM transactions t
      WHERE t.type = 'DES'
        AND LOWER(t.category) = LOWER(budgets.category)
        AND t.date LIKE ?
    )
  `, [`${getCurrentMonth()}%`]);
}

async function checkBudgetThresholds(tx: Transaction): Promise<void> {
  const rows = await d1q<any>('SELECT * FROM budgets WHERE LOWER(category) = LOWER(?)', [tx.category]);
  if (!rows.length) return;
  const b = mapBudget(rows[0]);
  const ratioBefore = (b.spentInCents - tx.amountInCents) / b.limitInCents;
  const ratioAfter = b.spentInCents / b.limitInCents;
  const pct = Math.round(ratioAfter * 100);
  const limit = (b.limitInCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (ratioAfter >= 1.0 && ratioBefore < 1.0) {
    await d1q('INSERT INTO alerts VALUES (?,?,?,?,?,?)', [`alert-ovr-${Date.now()}`, 'WARNING', `🚨 Orçamento Estourado: ${b.category}`, `Você ultrapassou 100% em ${b.category}. Gasto: R$ ${(b.spentInCents / 100).toFixed(2)} de ${limit}.`, new Date().toISOString(), 0]);
  } else if (ratioAfter >= 0.8 && ratioBefore < 0.8) {
    await d1q('INSERT INTO alerts VALUES (?,?,?,?,?,?)', [`alert-warn-${Date.now()}`, 'WARNING', `⚠️ Alerta de Gastos: ${b.category}`, `Você atingiu ${pct}% do limite de ${b.category}. Teto: ${limit}.`, new Date().toISOString(), 0]);
  }
}

// ─── Recurrence engine ────────────────────────────────────────────────────────

function nextOccurrence(rec: Recurrence, afterDate: Date): Date | null {
  const d = new Date(afterDate);
  switch (rec.frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly': {
      d.setMonth(d.getMonth() + 1);
      if (rec.dayOfMonth) d.setDate(Math.min(rec.dayOfMonth, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      break;
    }
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  if (rec.endDate && d > new Date(rec.endDate)) return null;
  return d;
}

async function processRecurrences(): Promise<void> {
  const rows = await d1q<any>('SELECT * FROM recurrences WHERE is_active = 1');
  if (!rows.length) return;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const stmts: { sql: string; params: (string | number | null)[] }[] = [];

  for (const row of rows) {
    const rec = mapRecurrence(row);
    const startDate = new Date(rec.startDate);
    if (startDate > today) continue;

    // Determine the last date we generated a transaction from
    let cursor = rec.lastGeneratedDate ? new Date(rec.lastGeneratedDate) : new Date(startDate);
    cursor.setHours(0, 0, 0, 0);

    // For monthly recurrences with a specific day, start cursor at the correct day
    if (!rec.lastGeneratedDate) {
      // First run: set cursor to one period before startDate so startDate itself gets generated
      cursor = new Date(startDate);
      cursor.setDate(cursor.getDate() - 1);
    }

    let generated = 0;
    // Generate all due occurrences up to today (max 12 at once to avoid runaway)
    while (generated < 12) {
      const next = nextOccurrence(rec, cursor);
      if (!next || next > today) break;

      const txDate = next.toISOString().split('T')[0];
      const txId = `tx-rec-${rec.id}-${txDate.replace(/-/g, '')}`;

      // Check if already generated (idempotent via id)
      const exists = await d1q<any>('SELECT id FROM transactions WHERE id = ?', [txId]);
      if (!exists.length) {
        stmts.push({
          sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced) VALUES (?,?,?,?,?,?,?,NULL,0)',
          params: [txId, rec.amountInCents, txDate, rec.type, rec.category, rec.description, rec.accountId]
        });
        if (rec.type === 'DES' && rec.accountId) {
          stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [rec.amountInCents, rec.accountId] });
        } else if (rec.type === 'REC' && rec.accountId) {
          stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [rec.amountInCents, rec.accountId] });
        }
      }

      stmts.push({ sql: 'UPDATE recurrences SET last_generated_date = ? WHERE id = ?', params: [txDate, rec.id] });
      cursor = next;
      generated++;
    }
  }

  if (stmts.length) {
    await d1exec(stmts);
    await recalculateBudgets();
  }
}

// ─── Proactive alert engine ───────────────────────────────────────────────────

async function generateProactiveAlerts(): Promise<void> {
  const now = new Date();
  const YYYYMM = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const stmts: { sql: string; params: (string | number | null)[] }[] = [];

  // 1. Negative account balances
  const accs = await d1q<any>('SELECT * FROM accounts WHERE balance_in_cents < 0');
  for (const a of accs) {
    const alertId = `alert-negbal-${a.id}-${YYYYMM}`;
    const balBRL = (a.balance_in_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    stmts.push({ sql: 'INSERT OR IGNORE INTO alerts VALUES (?,?,?,?,?,0)', params: [alertId, 'WARNING', `🔴 Saldo Negativo: ${a.name}`, `Conta "${a.name}" está com saldo de ${balBRL}. Realize um depósito para regularizar.`, now.toISOString()] });
  }

  // 2. Credit card usage > 80% of limit
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const cards = await d1q<any>('SELECT * FROM credit_cards WHERE is_active = 1 AND limit_in_cents > 0');
  const cardInvoices = await Promise.all(
    cards.map((c: any) => d1q<any>('SELECT COALESCE(SUM(total_in_cents),0) as used FROM invoices WHERE credit_card_id = ? AND month = ?', [c.id, currentMonth]))
  );
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const used = cardInvoices[i][0]?.used || 0;
    const ratio = used / card.limit_in_cents;
    if (ratio >= 0.8) {
      const alertId = `alert-cclim-${card.id}-${YYYYMM}`;
      const pct = Math.round(ratio * 100);
      const limBRL = (card.limit_in_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const emoji = ratio >= 1.0 ? '🚨' : '⚠️';
      stmts.push({ sql: 'INSERT OR IGNORE INTO alerts VALUES (?,?,?,?,?,0)', params: [alertId, 'WARNING', `${emoji} Limite de Cartão: ${card.name}`, `Cartão "${card.name}" utilizou ${pct}% do limite de ${limBRL}. Controle os gastos.`, now.toISOString()] });
    }
  }

  // 3. Invoices due in ≤ 3 days (not paid)
  const todayStr = now.toISOString().split('T')[0];
  const soon = new Date(now); soon.setDate(soon.getDate() + 3);
  const soonStr = soon.toISOString().split('T')[0];
  const dueInvs = await d1q<any>(
    `SELECT i.*, c.name as card_name FROM invoices i JOIN credit_cards c ON c.id = i.credit_card_id WHERE i.status != 'paid' AND i.due_date IS NOT NULL AND i.due_date BETWEEN ? AND ?`,
    [todayStr, soonStr]
  );
  for (const inv of dueInvs) {
    const alertId = `alert-invdue-${inv.id}`;
    const total = (inv.total_in_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dueFmt = new Date(inv.due_date + 'T12:00:00').toLocaleDateString('pt-BR');
    stmts.push({ sql: 'INSERT OR IGNORE INTO alerts VALUES (?,?,?,?,?,0)', params: [alertId, 'WARNING', `📅 Fatura Vencendo: ${inv.card_name}`, `Fatura de ${total} vence em ${dueFmt}. Acesse Cartões para efetuar o pagamento.`, now.toISOString()] });
  }

  // 4. Goals at 100%+
  const goals = await d1q<any>('SELECT * FROM goals WHERE target_in_cents > 0 AND current_in_cents >= target_in_cents');
  for (const g of goals) {
    const alertId = `alert-goalreach-${g.id}-${YYYYMM}`;
    const tgt = (g.target_in_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    stmts.push({ sql: 'INSERT OR IGNORE INTO alerts VALUES (?,?,?,?,?,0)', params: [alertId, 'SUCCESS', `🎯 Meta Atingida: ${g.name}`, `Parabéns! Você concluiu 100% da meta "${g.name}" de ${tgt}. Continue assim!`, now.toISOString()] });
  }

  if (stmts.length) await d1exec(stmts);
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_TX_TYPES = ['REC', 'DES', 'TRANS'] as const;
const VALID_ACC_TYPES = ['CASH', 'CHECKING', 'SAVINGS', 'INVESTMENT'] as const;

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  // ── Auth (public) ──────────────────────────────────────────────────────────

  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Muitas tentativas. Tente em 15 minutos.' });
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

  app.use('/api', requireAuth);

  // ── GET ALL DATA ───────────────────────────────────────────────────────────

  app.get('/api/data', async (_req, res) => {
    try {
      await processRecurrences();
      await recalculateBudgets();
      await generateProactiveAlerts();
      const [accounts, connections, transactions, budgets, goals, alerts, chatHistory, categories, creditCards, invoices, recurrences, familyMembers, igRows, igCounts] = await Promise.all([
        d1q<any>('SELECT * FROM accounts').then(r => r.map(mapAccount)),
        d1q<any>('SELECT * FROM connections').then(r => r.map(mapConnection)),
        d1q<any>('SELECT * FROM transactions ORDER BY date DESC, created_at DESC').then(r => r.map(mapTransaction)),
        d1q<any>('SELECT * FROM budgets').then(r => r.map(mapBudget)),
        d1q<any>('SELECT * FROM goals').then(r => r.map(mapGoal)),
        d1q<any>('SELECT * FROM alerts ORDER BY date DESC').then(r => r.map(mapAlert)),
        d1q<any>('SELECT * FROM chat_history ORDER BY rowid ASC').then(r => r.map(mapChat)),
        d1q<any>('SELECT * FROM categories ORDER BY parent_id ASC NULLS FIRST, name ASC').then(r => r.map(mapCategory)),
        d1q<any>('SELECT * FROM credit_cards WHERE is_active = 1').then(r => r.map(mapCreditCard)),
        d1q<any>('SELECT * FROM invoices ORDER BY month DESC').then(r => r.map(mapInvoice)),
        d1q<any>('SELECT * FROM recurrences WHERE is_active = 1 ORDER BY day_of_month ASC').then(r => r.map(mapRecurrence)),
        d1q<any>('SELECT * FROM family_members ORDER BY created_at ASC').then(r => r.map(mapFamilyMember)),
        d1q<any>('SELECT * FROM installment_groups ORDER BY start_date DESC'),
        d1q<any>(`SELECT installment_group_id, COUNT(*) as cnt FROM transactions WHERE installment_group_id IS NOT NULL AND date <= date('now') GROUP BY installment_group_id`),
      ]);
      const paidMap = Object.fromEntries(igCounts.map((r: any) => [r.installment_group_id, r.cnt]));
      const installmentGroups = igRows.map((r: any) => mapInstallmentGroup(r, paidMap[r.id] || 0));
      res.json({ accounts, connections, transactions, budgets, goals, alerts, chatHistory, categories, creditCards, invoices, recurrences, familyMembers, installmentGroups });
    } catch (e: any) {
      console.error('[D1]', e.message);
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── CREATE TRANSACTION ─────────────────────────────────────────────────────

  app.post('/api/transactions', async (req, res) => {
    const { amountInCents, date, type, category, description, accountId, destinationAccountId,
            creditCardId, installments, documentKey, memberId } = req.body;
    if (!amountInCents || !date || !type || !category || !description)
      return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
    if (!VALID_TX_TYPES.includes(type))
      return res.status(400).json({ error: 'Tipo inválido. Use REC, DES ou TRANS.' });
    const amount = parseInt(amountInCents, 10);
    if (isNaN(amount) || amount <= 0)
      return res.status(400).json({ error: 'Valor deve ser inteiro positivo em centavos.' });

    // Credit card transaction: accountId is optional (card carries the debt)
    const isCreditCard = !!creditCardId;
    if (!isCreditCard && !accountId)
      return res.status(400).json({ error: 'accountId obrigatório para transações sem cartão.' });

    const numInstallments = installments && installments > 1 ? Math.min(parseInt(installments, 10), 48) : 1;
    const installmentGroupId = numInstallments > 1 ? `grp-${Date.now()}` : null;
    const baseId = `tx-usr-${Date.now()}`;

    try {
      const stmts: { sql: string; params: (string | number | null)[] }[] = [];

      if (isCreditCard) {
        // Resolve or create invoice for the billing month
        const txDate = new Date(date);
        const cardRows = await d1q<any>('SELECT * FROM credit_cards WHERE id = ?', [creditCardId]);
        if (!cardRows.length) return res.status(404).json({ error: 'Cartão não encontrado.' });
        const card = mapCreditCard(cardRows[0]);

        for (let i = 0; i < numInstallments; i++) {
          const instDate = new Date(txDate);
          instDate.setMonth(instDate.getMonth() + i);
          const instMonth = `${instDate.getFullYear()}-${String(instDate.getMonth() + 1).padStart(2, '0')}`;
          const instAmount = Math.round(amount / numInstallments);

          // Ensure invoice exists
          const invId = `inv-${creditCardId}-${instMonth.replace('-', '')}`;
          const dueYear = instDate.getMonth() + 1 === 12 ? instDate.getFullYear() + 1 : instDate.getFullYear();
          const dueMonth = ((instDate.getMonth() + 1) % 12) + 1;
          const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(card.dueDay).padStart(2, '0')}`;

          stmts.push({ sql: `INSERT OR IGNORE INTO invoices (id,credit_card_id,month,total_in_cents,status,due_date,created_at) VALUES (?,?,?,0,'open',?,datetime('now'))`, params: [invId, creditCardId, instMonth, dueDate] });
          stmts.push({ sql: 'UPDATE invoices SET total_in_cents = total_in_cents + ? WHERE id = ?', params: [instAmount, invId] });

          const txId = numInstallments > 1 ? `${baseId}-${i + 1}` : baseId;
          stmts.push({
            sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,credit_card_id,invoice_id,installment_number,installment_total,installment_group_id,document_key,member_id) VALUES (?,?,?,?,?,?,NULL,0,?,?,?,?,?,?,?)',
            params: [txId, instAmount, instDate.toISOString().split('T')[0], type, category,
              numInstallments > 1 ? `${description} (${i + 1}/${numInstallments})` : description,
              creditCardId, invId, numInstallments > 1 ? i + 1 : null, numInstallments > 1 ? numInstallments : null, installmentGroupId,
              i === 0 ? (documentKey || null) : null, i === 0 ? (memberId || null) : null]
          });
        }
      } else {
        stmts.push({
          sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,document_key,member_id) VALUES (?,?,?,?,?,?,?,?,0,?,?)',
          params: [baseId, amount, date, type, category, description, accountId, destinationAccountId || null, documentKey || null, memberId || null]
        });
        if (type === 'DES') stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [amount, accountId] });
        else if (type === 'REC') stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [amount, accountId] });
        else if (type === 'TRANS') {
          stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [amount, accountId] });
          stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [amount, destinationAccountId] });
        }
      }

      await d1exec(stmts);
      await recalculateBudgets();
      if (type === 'DES' && !isCreditCard) {
        const rows = await d1q<any>('SELECT * FROM transactions WHERE id = ?', [baseId]);
        if (rows[0]) await checkBudgetThresholds(mapTransaction(rows[0]));
      }
      res.status(201).json({ id: baseId });
    } catch (e: any) {
      console.error('[D1]', e.message);
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── EDIT TRANSACTION ──────────────────────────────────────────────────────

  app.put('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    const { amountInCents, date, category, description } = req.body;
    try {
      const rows = await d1q<any>('SELECT * FROM transactions WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Transação não encontrada.' });
      const old = mapTransaction(rows[0]);
      const newAmount = amountInCents ? parseInt(amountInCents, 10) : old.amountInCents;
      if (isNaN(newAmount) || newAmount <= 0) return res.status(400).json({ error: 'Valor inválido.' });

      const stmts: { sql: string; params: (string | number | null)[] }[] = [
        { sql: 'UPDATE transactions SET amount_in_cents=?,date=?,category=?,description=? WHERE id=?', params: [newAmount, date || old.date, category || old.category, description || old.description, id] }
      ];

      // Adjust account balance for amount delta
      const diff = newAmount - old.amountInCents;
      if (diff !== 0 && old.accountId) {
        if (old.type === 'DES') stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [diff, old.accountId] });
        else if (old.type === 'REC') stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [diff, old.accountId] });
        else if (old.type === 'TRANS') {
          stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [diff, old.accountId] });
          if (old.destinationAccountId) stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [diff, old.destinationAccountId] });
        }
      }

      await d1exec(stmts);
      await recalculateBudgets();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── DELETE TRANSACTION ─────────────────────────────────────────────────────

  app.delete('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const rows = await d1q<any>('SELECT * FROM transactions WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Transação não encontrada.' });
      const tx = mapTransaction(rows[0]);
      const stmts: { sql: string; params: (string | number | null)[] }[] = [
        { sql: 'DELETE FROM transactions WHERE id = ?', params: [id] }
      ];
      if (tx.type === 'DES') stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [tx.amountInCents, tx.accountId] });
      else if (tx.type === 'REC') stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [tx.amountInCents, tx.accountId] });
      else if (tx.type === 'TRANS') {
        stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [tx.amountInCents, tx.accountId] });
        if (tx.destinationAccountId) stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [tx.amountInCents, tx.destinationAccountId] });
      }
      await d1exec(stmts);
      await recalculateBudgets();
      res.json({ success: true });
    } catch (e: any) {
      console.error('[D1]', e.message);
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── EDIT / DELETE ACCOUNT ─────────────────────────────────────────────────

  app.put('/api/accounts/:id', async (req, res) => {
    const { id } = req.params;
    const { name, bankName, type, color } = req.body;
    if (!name || !bankName) return res.status(400).json({ error: 'name e bankName são obrigatórios.' });
    if (type && !VALID_ACC_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo inválido.' });
    try {
      const rows = await d1q('SELECT id FROM accounts WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Conta não encontrada.' });
      await d1q('UPDATE accounts SET name=?,bank_name=?,type=?,color=? WHERE id=?', [name, bankName, type || 'CHECKING', color || '#6B7280', id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.delete('/api/accounts/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const txCount = await d1q<any>('SELECT COUNT(*) as cnt FROM transactions WHERE account_id = ?', [id]);
      if ((txCount[0]?.cnt || 0) > 0) return res.status(400).json({ error: 'Não é possível excluir conta com transações associadas.' });
      await d1q('DELETE FROM accounts WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // ── CREATE ACCOUNT ─────────────────────────────────────────────────────────

  app.post('/api/accounts', async (req, res) => {
    const { name, type, bankName, balanceInCents, color } = req.body;
    if (!name || !type || !bankName || balanceInCents === undefined)
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    if (!VALID_ACC_TYPES.includes(type))
      return res.status(400).json({ error: 'Tipo inválido.' });
    const balance = parseInt(balanceInCents, 10);
    if (isNaN(balance) || balance < 0)
      return res.status(400).json({ error: 'Saldo inicial deve ser não-negativo em centavos.' });
    const id = `acc-usr-${Date.now()}`;
    try {
      await d1q('INSERT INTO accounts VALUES (?,?,?,?,?,?,0)', [id, name, type, bankName, balance, color || '#6B7280']);
      res.status(201).json({ id });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── RESET ──────────────────────────────────────────────────────────────────

  app.post('/api/reset', async (_req, res) => {
    try {
      const stmts: { sql: string; params?: (string | number | null)[] }[] = [
        { sql: 'DELETE FROM transactions' }, { sql: 'DELETE FROM accounts' },
        { sql: 'DELETE FROM connections' }, { sql: 'DELETE FROM budgets' },
        { sql: 'DELETE FROM goals' }, { sql: 'DELETE FROM alerts' }, { sql: 'DELETE FROM chat_history' }
      ];
      for (const a of INITIAL_ACCOUNTS) stmts.push({ sql: 'INSERT INTO accounts VALUES (?,?,?,?,?,?,?)', params: [a.id, a.name, a.type, a.bankName, a.balanceInCents, a.color, a.isLinked ? 1 : 0] });
      for (const c of INITIAL_CONNECTIONS) stmts.push({ sql: 'INSERT INTO connections VALUES (?,?,?,?,?,?)', params: [c.id, c.institutionName, c.logo || '🏦', c.status, c.itemId || null, c.lastSyncedAt || null] });
      for (const t of INITIAL_TRANSACTIONS) stmts.push({ sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,destination_account_id,is_synced,original_merchant_name) VALUES (?,?,?,?,?,?,?,?,?,?)', params: [t.id, t.amountInCents, t.date, t.type, t.category, t.description, t.accountId, t.destinationAccountId || null, t.isSynced ? 1 : 0, t.originalMerchantName || null] });
      for (const b of INITIAL_BUDGETS) stmts.push({ sql: 'INSERT INTO budgets VALUES (?,?,?,?)', params: [b.id, b.category, b.limitInCents, b.spentInCents] });
      for (const g of INITIAL_GOALS) stmts.push({ sql: 'INSERT INTO goals VALUES (?,?,?,?,?,?)', params: [g.id, g.name, g.targetInCents, g.currentInCents, g.targetDate, g.color] });
      for (const a of INITIAL_ALERTS) stmts.push({ sql: 'INSERT INTO alerts VALUES (?,?,?,?,?,?)', params: [a.id, a.type, a.title, a.message, a.date, a.isRead ? 1 : 0] });
      stmts.push({ sql: 'INSERT INTO alerts VALUES (?,?,?,?,?,?)', params: [`alt-reset-${Date.now()}`, 'SUCCESS', 'Restaurado para Estado Inicial', 'Dados reiniciados com sucesso para os valores padrão.', new Date().toISOString(), 0] });
      await d1exec(stmts);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── UPDATE BUDGET ──────────────────────────────────────────────────────────

  app.post('/api/budgets/update', async (req, res) => {
    const { limitInCents, category } = req.body;
    const limit = parseInt(limitInCents, 10);
    if (isNaN(limit) || limit <= 0) return res.status(400).json({ error: 'Limite deve ser positivo em centavos.' });
    try {
      const existing = await d1q('SELECT id FROM budgets WHERE LOWER(category) = LOWER(?)', [category]);
      if (existing.length) {
        await d1q('UPDATE budgets SET limit_in_cents = ? WHERE LOWER(category) = LOWER(?)', [limit, category]);
      } else {
        await d1q('INSERT INTO budgets VALUES (?,?,?,0)', [`b-usr-${Date.now()}`, category, limit]);
      }
      await recalculateBudgets();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  app.delete('/api/budgets/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const rows = await d1q('SELECT id FROM budgets WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Orçamento não encontrado.' });
      await d1q('DELETE FROM budgets WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── GOALS ──────────────────────────────────────────────────────────────────

  app.post('/api/goals/update', async (req, res) => {
    const { id, amountToAdd } = req.body;
    const amount = parseInt(amountToAdd, 10);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Valor deve ser positivo em centavos.' });
    try {
      const rows = await d1q('SELECT id FROM goals WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Meta não encontrada.' });
      await d1q('UPDATE goals SET current_in_cents = current_in_cents + ? WHERE id = ?', [amount, id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  app.post('/api/goals', async (req, res) => {
    const { name, targetInCents, targetDate, color, currentInCents } = req.body;
    if (!name || isNaN(targetInCents) || targetInCents <= 0 || !targetDate)
      return res.status(400).json({ error: 'Parâmetros inválidos para criação da meta.' });
    const id = `g-usr-${Date.now()}`;
    try {
      await d1q('INSERT INTO goals VALUES (?,?,?,?,?,?)', [id, name, parseInt(targetInCents, 10), currentInCents ? parseInt(currentInCents, 10) : 0, targetDate, color || '#6366F1']);
      res.json({ id });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  app.delete('/api/goals/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const rows = await d1q('SELECT id FROM goals WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Meta não encontrada.' });
      await d1q('DELETE FROM goals WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── ALERTS ─────────────────────────────────────────────────────────────────

  app.post('/api/alerts/read', async (req, res) => {
    const { id } = req.body;
    try {
      await d1q('UPDATE alerts SET is_read = 1 WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  app.post('/api/alerts/read-all', async (_req, res) => {
    try {
      await d1q('UPDATE alerts SET is_read = 1');
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  app.delete('/api/alerts/clear-read', async (_req, res) => {
    try {
      await d1q('DELETE FROM alerts WHERE is_read = 1');
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── OPEN FINANCE SYNC ──────────────────────────────────────────────────────

  app.post('/api/open-finance/connect', async (req, res) => {
    const { bankName } = req.body;
    if (!bankName) return res.status(400).json({ error: 'Selecione uma instituição bancária.' });
    try {
      const existing = await d1q<any>('SELECT * FROM connections WHERE LOWER(institution_name) = LOWER(?)', [bankName]);
      let connId: string;
      let itemId: string;
      if (existing.length) {
        connId = existing[0].id;
        itemId = existing[0].item_id || `plg_${bankName.replace(/\s+/g, '').toLowerCase()}_${Math.floor(1000 + Math.random() * 9000)}`;
        await d1q('UPDATE connections SET status = ? WHERE id = ?', ['SYNCING', connId]);
      } else {
        connId = `conn-bank-${Date.now()}`;
        itemId = `plg_${bankName.replace(/\s+/g, '').toLowerCase()}_${Math.floor(1000 + Math.random() * 9000)}`;
        await d1q('INSERT INTO connections VALUES (?,?,?,?,?,?)', [connId, bankName, '⚡', 'SYNCING', itemId, null]);
      }

      const mockTxns = [
        { desc: 'RESTAURANTE ASSIS BURGER', amount: 8450, category: 'Alimentação' },
        { desc: 'AUTO POSTO IPIRANGA', amount: 15000, category: 'Transporte' },
        { desc: 'MERCADO DISTRITO LTDA', amount: 21020, category: 'Alimentação' },
        { desc: 'CORTE FEITO BARBEARIA', amount: 6500, category: 'Outros' },
        { desc: 'CURSO INGLÊS COMPLETO', amount: 18000, category: 'Educação' },
      ];

      setTimeout(async () => {
        try {
          await d1q('UPDATE connections SET status = ?, last_synced_at = ? WHERE id = ?', ['CONNECTED', new Date().toISOString(), connId]);
          const accRows = await d1q<any>('SELECT * FROM accounts WHERE LOWER(bank_name) = LOWER(?)', [bankName]);
          let targetAccId: string;
          if (accRows.length) {
            targetAccId = accRows[0].id;
            await d1q('UPDATE accounts SET is_linked = 1 WHERE id = ?', [targetAccId]);
          } else {
            targetAccId = `acc-auto-${Date.now()}`;
            await d1q('INSERT INTO accounts VALUES (?,?,?,?,?,?,1)', [targetAccId, `Conta Corrente ${bankName}`, 'CHECKING', bankName, 1200000, '#3B82F6']);
          }
          const stmts: { sql: string; params: (string | number | null)[] }[] = [];
          for (const item of mockTxns) {
            const d = new Date();
            d.setDate(d.getDate() - Math.floor(Math.random() * 10));
            const txId = `tx-sync-${Math.random().toString(36).slice(2, 11)}`;
            stmts.push({ sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,original_merchant_name) VALUES (?,?,?,?,?,?,?,1,?)', params: [txId, item.amount, d.toISOString().split('T')[0], 'DES', item.category, item.desc, targetAccId, item.desc] });
            stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [item.amount, targetAccId] });
          }
          stmts.push({ sql: 'INSERT INTO alerts VALUES (?,?,?,?,?,?)', params: [`alert-conn-${Date.now()}`, 'SUCCESS', `🔗 Conexão Bem-sucedida: ${bankName}`, `${mockTxns.length} transações sincronizadas com sucesso.`, new Date().toISOString(), 0] });
          await d1exec(stmts);
          await recalculateBudgets();
        } catch (e) { console.error('[SYNC]', e); }
      }, 4000);

      res.json({ success: true, status: 'SYNCING', itemId });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── R2 BACKUP ─────────────────────────────────────────────────────────────

  app.post('/api/backup', async (_req, res) => {
    try {
      const [accounts, transactions, budgets, goals, alerts] = await Promise.all([
        d1q<any>('SELECT * FROM accounts').then(r => r.map(mapAccount)),
        d1q<any>('SELECT * FROM transactions ORDER BY date DESC').then(r => r.map(mapTransaction)),
        d1q<any>('SELECT * FROM budgets').then(r => r.map(mapBudget)),
        d1q<any>('SELECT * FROM goals').then(r => r.map(mapGoal)),
        d1q<any>('SELECT * FROM alerts').then(r => r.map(mapAlert)),
      ]);
      const snapshot = { exportedAt: new Date().toISOString(), accounts, transactions, budgets, goals, alerts };
      const key = `backups/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await r2Put(key, JSON.stringify(snapshot, null, 2));
      res.json({ success: true, key, records: { accounts: accounts.length, transactions: transactions.length } });
    } catch (e: any) {
      res.status(500).json({ error: 'Backup failed', details: e.message });
    }
  });

  // ── CATEGORIES ────────────────────────────────────────────────────────────

  app.get('/api/categories', async (_req, res) => {
    try {
      const rows = await d1q<any>('SELECT * FROM categories ORDER BY parent_id ASC NULLS FIRST, name ASC');
      res.json(rows.map(mapCategory));
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.post('/api/categories', async (req, res) => {
    const { name, parentId, icon, color, type: catType } = req.body;
    if (!name) return res.status(400).json({ error: 'name obrigatório.' });
    const id = `cat-usr-${Date.now()}`;
    try {
      await d1q('INSERT INTO categories VALUES (?,?,?,?,?,?)', [id, name, parentId || null, icon || '📦', color || '#6B7280', catType || 'both']);
      res.status(201).json({ id });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.delete('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    try {
      // Prevent deleting parent if children exist
      const children = await d1q('SELECT id FROM categories WHERE parent_id = ?', [id]);
      if (children.length) return res.status(400).json({ error: 'Remova as subcategorias antes de excluir a categoria pai.' });
      await d1q('DELETE FROM categories WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // ── CREDIT CARDS ──────────────────────────────────────────────────────────

  app.get('/api/credit-cards', async (_req, res) => {
    try {
      const rows = await d1q<any>('SELECT * FROM credit_cards WHERE is_active = 1');
      res.json(rows.map(mapCreditCard));
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.post('/api/credit-cards', async (req, res) => {
    const { name, bankName, lastFour, limitInCents, billingDay, dueDay, color } = req.body;
    if (!name || !bankName || !limitInCents)
      return res.status(400).json({ error: 'name, bankName e limitInCents são obrigatórios.' });
    const id = `cc-usr-${Date.now()}`;
    try {
      await d1q('INSERT INTO credit_cards VALUES (?,?,?,?,?,?,?,?,1)',
        [id, name, bankName, lastFour || null, parseInt(limitInCents, 10), billingDay || 1, dueDay || 10, color || '#6366F1']);
      res.status(201).json({ id });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.put('/api/credit-cards/:id', async (req, res) => {
    const { id } = req.params;
    const { name, bankName, lastFour, limitInCents, billingDay, dueDay, color } = req.body;
    try {
      const rows = await d1q('SELECT id FROM credit_cards WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Cartão não encontrado.' });
      await d1q('UPDATE credit_cards SET name=?,bank_name=?,last_four=?,limit_in_cents=?,billing_day=?,due_day=?,color=? WHERE id=?',
        [name, bankName, lastFour || null, parseInt(limitInCents, 10), billingDay || 1, dueDay || 10, color || '#6366F1', id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.delete('/api/credit-cards/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await d1q('UPDATE credit_cards SET is_active = 0 WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // ── INVOICES ──────────────────────────────────────────────────────────────

  app.get('/api/invoices', async (req, res) => {
    try {
      const { creditCardId, month } = req.query;
      let sql = 'SELECT * FROM invoices WHERE 1=1';
      const params: string[] = [];
      if (creditCardId) { sql += ' AND credit_card_id = ?'; params.push(creditCardId as string); }
      if (month) { sql += ' AND month = ?'; params.push(month as string); }
      sql += ' ORDER BY month DESC';
      const rows = await d1q<any>(sql, params);
      res.json(rows.map(mapInvoice));
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // Pay invoice: debit an account, mark invoice as paid
  app.post('/api/invoices/:id/pay', async (req, res) => {
    const { id } = req.params;
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId obrigatório para pagamento.' });
    try {
      const invRows = await d1q<any>('SELECT * FROM invoices WHERE id = ?', [id]);
      if (!invRows.length) return res.status(404).json({ error: 'Fatura não encontrada.' });
      const inv = mapInvoice(invRows[0]);
      if (inv.status === 'paid') return res.status(400).json({ error: 'Fatura já está paga.' });

      const paidAt = new Date().toISOString();
      await d1exec([
        { sql: 'UPDATE invoices SET status = ?, paid_at = ? WHERE id = ?', params: ['paid', paidAt, id] },
        { sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [inv.totalInCents, accountId] },
      ]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // ── RECURRENCES ───────────────────────────────────────────────────────────

  app.get('/api/recurrences', async (_req, res) => {
    try {
      const rows = await d1q<any>('SELECT * FROM recurrences ORDER BY day_of_month ASC');
      res.json(rows.map(mapRecurrence));
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.post('/api/recurrences', async (req, res) => {
    const { description, amountInCents, type, category, accountId, creditCardId, frequency, dayOfMonth, startDate, endDate } = req.body;
    if (!description || !amountInCents || !type || !category || !frequency || !startDate)
      return res.status(400).json({ error: 'Campos obrigatórios: description, amountInCents, type, category, frequency, startDate.' });
    if (!VALID_TX_TYPES.includes(type))
      return res.status(400).json({ error: 'Tipo inválido. Use REC ou DES.' });
    const amount = parseInt(amountInCents, 10);
    if (isNaN(amount) || amount <= 0)
      return res.status(400).json({ error: 'Valor deve ser inteiro positivo em centavos.' });
    const id = `rec-usr-${Date.now()}`;
    try {
      await d1q(
        'INSERT INTO recurrences (id,description,amount_in_cents,type,category,account_id,credit_card_id,frequency,day_of_month,start_date,end_date,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
        [id, description, amount, type, category, accountId || null, creditCardId || null, frequency, dayOfMonth || null, startDate, endDate || null]
      );
      res.status(201).json({ id });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.put('/api/recurrences/:id', async (req, res) => {
    const { id } = req.params;
    const { description, amountInCents, type, category, accountId, creditCardId, frequency, dayOfMonth, startDate, endDate, isActive } = req.body;
    try {
      const rows = await d1q('SELECT id FROM recurrences WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Recorrência não encontrada.' });
      await d1q(
        'UPDATE recurrences SET description=?,amount_in_cents=?,type=?,category=?,account_id=?,credit_card_id=?,frequency=?,day_of_month=?,start_date=?,end_date=?,is_active=? WHERE id=?',
        [description, parseInt(amountInCents, 10), type, category, accountId || null, creditCardId || null, frequency, dayOfMonth || null, startDate, endDate || null, isActive ? 1 : 0, id]
      );
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.delete('/api/recurrences/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await d1q('UPDATE recurrences SET is_active = 0 WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // Force-generate pending recurrences now
  app.post('/api/recurrences/process', async (_req, res) => {
    try {
      await processRecurrences();
      await recalculateBudgets();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // ── REPORTS ───────────────────────────────────────────────────────────────

  // Monthly aggregated summary (last N months)
  app.get('/api/reports/monthly-summary', async (req, res) => {
    try {
      const months = Math.min(parseInt((req.query.months as string) || '6', 10), 24);
      const results: { month: string; income: number; expense: number; balance: number }[] = [];
      const now = new Date();

      // Build one query per month in parallel
      const monthKeys: string[] = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      const monthData = await Promise.all(
        monthKeys.map(m =>
          d1q<any>(
            `SELECT type, SUM(amount_in_cents) as total FROM transactions
             WHERE date LIKE ? AND type IN ('REC','DES') GROUP BY type`,
            [`${m}%`]
          )
        )
      );

      for (let i = 0; i < monthKeys.length; i++) {
        let income = 0, expense = 0;
        for (const row of monthData[i]) {
          if (row.type === 'REC') income = row.total;
          else if (row.type === 'DES') expense = row.total;
        }
        results.push({ month: monthKeys[i], income, expense, balance: income - expense });
      }

      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // CSV export of transactions
  app.get('/api/export/transactions.csv', async (req, res) => {
    try {
      const { startDate, endDate, type } = req.query;
      let sql = 'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id WHERE 1=1';
      const params: (string | number | null)[] = [];
      if (startDate) { sql += ' AND t.date >= ?'; params.push(startDate as string); }
      if (endDate)   { sql += ' AND t.date <= ?'; params.push(endDate as string); }
      if (type)      { sql += ' AND t.type = ?';  params.push(type as string); }
      sql += ' ORDER BY t.date DESC, t.created_at DESC';

      const rows = await d1q<any>(sql, params);

      const headers = ['id', 'data', 'tipo', 'categoria', 'descricao', 'conta', 'valor_reais', 'sinc_open_finance', 'merchant_original', 'cartao_credito_id', 'parcela', 'parcelas_total'];
      const lines = [headers.join(',')];
      for (const r of rows) {
        const cols = [
          r.id,
          r.date,
          r.type,
          r.category,
          `"${(r.description || '').replace(/"/g, '""')}"`,
          `"${(r.account_name || '').replace(/"/g, '""')}"`,
          (r.amount_in_cents / 100).toFixed(2),
          r.is_synced ? 'sim' : 'nao',
          `"${(r.original_merchant_name || '').replace(/"/g, '""')}"`,
          r.credit_card_id || '',
          r.installment_number || '',
          r.installment_total || '',
        ];
        lines.push(cols.join(','));
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="transacoes.csv"');
      res.send('﻿' + lines.join('\r\n')); // BOM for Excel UTF-8
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── DOCUMENT AI ANALYZE ────────────────────────────────────────────────────

  app.post('/api/documents/analyze', express.json({ limit: '20mb' }), async (req, res) => {
    const { base64, mimeType, documentType } = req.body;
    if (!base64 || !mimeType || !documentType) return res.status(400).json({ error: 'base64, mimeType e documentType são obrigatórios.' });
    if (!['BILL', 'INVOICE'].includes(documentType)) return res.status(400).json({ error: 'documentType deve ser BILL ou INVOICE.' });

    const client = getGroqClient();

    const billPrompt = `Você é um sistema de extração de dados de documentos financeiros brasileiros. Analise este documento (conta de luz, água, boleto, IPTU, etc.) e extraia APENAS as informações em JSON válido:
{"description":"nome do serviço ou tipo de conta","amountInCents":número inteiro em centavos (ex 15750 para R$157,50),"dueDate":"YYYY-MM-DD","payerName":"nome do pagador se visível ou null","payerDoc":"CPF/CNPJ se visível ou null"}
Se não conseguir extrair um campo use null. Retorne APENAS o JSON.`;

    const invoicePrompt = `Você é um sistema de extração de faturas de cartão de crédito brasileiro. Analise esta fatura e extraia em JSON:
{"dueDate":"YYYY-MM-DD","totalAmountInCents":número inteiro em centavos,"lineItems":[{"date":"YYYY-MM-DD","merchant":"nome do estabelecimento","amountInCents":número inteiro em centavos}]}
Inclua TODOS os lançamentos visíveis. Retorne APENAS o JSON.`;

    let extracted: any = {};

    if (client) {
      try {
        const response = await client.chat.completions.create({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{ role: 'user', content: [
            { type: 'text', text: documentType === 'INVOICE' ? invoicePrompt : billPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
          ] as any }],
          temperature: 0.1, max_tokens: 2048,
        });
        const raw = response.choices[0]?.message?.content || '{}';
        const match = raw.match(/\{[\s\S]*\}/);
        extracted = match ? JSON.parse(match[0]) : {};
      } catch (e: any) {
        console.error('[Groq Vision]', e.message);
      }
    }

    // Auto-categorize line items for invoices
    if (documentType === 'INVOICE' && Array.isArray(extracted.lineItems)) {
      extracted.lineItems = extracted.lineItems.map((item: any) => ({
        ...item,
        category: classifyMerchant(item.merchant || ''),
      }));
    }

    // Store document in R2
    const now = new Date();
    const extMap: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    const ext = extMap[mimeType] || 'jpg';
    const docKey = `documents/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/doc-${Date.now()}.${ext}`;
    const buffer = Buffer.from(base64, 'base64');
    await r2PutBinary(docKey, buffer, mimeType);

    res.json({ ...extracted, documentKey: docKey });
  });

  // ── INVOICE LINE ITEMS BULK IMPORT ─────────────────────────────────────────

  app.post('/api/import/invoice', async (req, res) => {
    const { items, creditCardId } = req.body;
    if (!Array.isArray(items) || !creditCardId) return res.status(400).json({ error: 'items e creditCardId são obrigatórios.' });

    const cardRows = await d1q<any>('SELECT * FROM credit_cards WHERE id = ?', [creditCardId]);
    if (!cardRows.length) return res.status(404).json({ error: 'Cartão não encontrado.' });
    const card = mapCreditCard(cardRows[0]);

    const stmts: { sql: string; params: (string | number | null)[] }[] = [];
    let imported = 0;
    const errors: string[] = [];

    for (const item of items) {
      const { date, merchant, amountInCents, category } = item;
      if (!date || !merchant || !amountInCents) { errors.push(`Item inválido: ${JSON.stringify(item)}`); continue; }
      const amount = Math.round(Number(amountInCents));
      if (isNaN(amount) || amount <= 0) { errors.push(`Valor inválido: ${amountInCents}`); continue; }

      const txDate = new Date(date);
      const instMonth = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
      const invId = `inv-${creditCardId}-${instMonth.replace('-', '')}`;
      const dueYear = txDate.getMonth() + 1 === 12 ? txDate.getFullYear() + 1 : txDate.getFullYear();
      const dueMonth = ((txDate.getMonth() + 1) % 12) + 1;
      const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(card.dueDay).padStart(2, '0')}`;

      stmts.push({ sql: `INSERT OR IGNORE INTO invoices (id,credit_card_id,month,total_in_cents,status,due_date,created_at) VALUES (?,?,?,0,'open',?,datetime('now'))`, params: [invId, creditCardId, instMonth, dueDate] });
      stmts.push({ sql: 'UPDATE invoices SET total_in_cents = total_in_cents + ? WHERE id = ?', params: [amount, invId] });

      const txId = `tx-inv-${creditCardId}-${date.replace(/-/g, '')}-${amount}-${merchant.slice(0, 8).replace(/\W/g, '')}`;
      stmts.push({
        sql: 'INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,credit_card_id,invoice_id) VALUES (?,?,?,\'DES\',?,?,NULL,0,?,?)',
        params: [txId, amount, date, category || classifyMerchant(merchant), merchant, creditCardId, invId]
      });
      imported++;
    }

    if (stmts.length) {
      try {
        await d1exec(stmts);
        await recalculateBudgets();
      } catch (e: any) {
        return res.status(500).json({ error: 'D1 error', details: e.message });
      }
    }

    res.json({ imported, errors });
  });

  // ── DOCUMENT PROXY (serve from R2 for iframe) ──────────────────────────────

  app.get('/api/documents/*', async (req, res) => {
    const key = (req.params as any)[0] as string;
    if (!key) return res.status(400).json({ error: 'key obrigatória' });
    const doc = await r2GetBinary(key);
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' });
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(doc.body));
  });

  // ── CSV IMPORT ─────────────────────────────────────────────────────────────

  app.post('/api/import/csv', async (req, res) => {
    const { csv, accountId } = req.body;
    if (!csv || !accountId) return res.status(400).json({ error: 'csv e accountId são obrigatórios.' });

    const accRows = await d1q<any>('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (!accRows.length) return res.status(404).json({ error: 'Conta não encontrada.' });

    const classify = classifyMerchant;

    const lines = csv.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const stmts: { sql: string; params: (string | number | null)[] }[] = [];
    let imported = 0;
    const errors: string[] = [];
    let balanceDelta = 0;

    for (const line of lines) {
      // Skip header
      if (/^(data|date|dia)/i.test(line)) continue;

      // Support comma or semicolon delimited; strip BOM
      const cols = line.replace(/^﻿/, '').split(/[,;]/).map((c: string) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 3) { errors.push(`Linha ignorada (colunas insuficientes): ${line.slice(0, 60)}`); continue; }

      const [rawDate, rawDesc, rawAmount, rawType] = cols;

      // Date: accept YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
      let date = rawDate;
      if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(rawDate)) {
        const parts = rawDate.split(/[\/\-]/);
        date = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`Data inválida: ${rawDate}`); continue; }

      const amountFloat = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.'));
      if (isNaN(amountFloat)) { errors.push(`Valor inválido: ${rawAmount}`); continue; }

      const amountInCents = Math.round(Math.abs(amountFloat) * 100);
      if (amountInCents === 0) continue;

      // Determine type: explicit column, or sign of amount
      let type: 'REC' | 'DES';
      if (rawType) {
        type = /crédito|credito|entrada|receita|credit/i.test(rawType) ? 'REC' : 'DES';
      } else {
        type = amountFloat > 0 ? 'REC' : 'DES';
      }

      const category = type === 'REC' ? 'Receita' : classify(rawDesc);
      const txId = `tx-imp-${accountId}-${date.replace(/-/g, '')}-${Math.abs(amountInCents)}-${rawDesc.slice(0, 8).replace(/\W/g, '')}`;

      stmts.push({ sql: 'INSERT OR IGNORE INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced) VALUES (?,?,?,?,?,?,?,0)', params: [txId, amountInCents, date, type, category, rawDesc, accountId] });
      balanceDelta += type === 'REC' ? amountInCents : -amountInCents;
      imported++;
    }

    if (stmts.length) {
      stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [balanceDelta, accountId] });
      try {
        await d1exec(stmts);
        await recalculateBudgets();
      } catch (e: any) {
        return res.status(500).json({ error: 'D1 error', details: e.message });
      }
    }

    res.json({ imported, errors });
  });

  // ── FAMILY MEMBERS ─────────────────────────────────────────────────────────

  app.get('/api/family', async (_req, res) => {
    try {
      const rows = await d1q<any>('SELECT * FROM family_members ORDER BY created_at ASC');
      res.json(rows.map(mapFamilyMember));
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.post('/api/family', async (req, res) => {
    const { name, avatarColor } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name é obrigatório.' });
    const id = `mbr-${Date.now()}`;
    try {
      await d1q('INSERT INTO family_members (id,name,avatar_color) VALUES (?,?,?)', [id, name.trim(), avatarColor || '#6366F1']);
      res.status(201).json({ id });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.delete('/api/family/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const txCount = await d1q<any>('SELECT COUNT(*) as cnt FROM transactions WHERE member_id = ?', [id]);
      if ((txCount[0]?.cnt || 0) > 0) return res.status(400).json({ error: 'Não é possível excluir membro com transações associadas.' });
      await d1q('DELETE FROM family_members WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // ── EDIT CATEGORY ──────────────────────────────────────────────────────────

  app.put('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, icon, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name é obrigatório.' });
    try {
      const rows = await d1q('SELECT id FROM categories WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Categoria não encontrada.' });
      await d1q('UPDATE categories SET name=?,icon=?,color=? WHERE id=?', [name.trim(), icon || '📦', color || '#6B7280', id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // ── INSTALLMENTS ───────────────────────────────────────────────────────────

  app.get('/api/installments', async (_req, res) => {
    try {
      const [rows, counts] = await Promise.all([
        d1q<any>('SELECT * FROM installment_groups ORDER BY start_date DESC'),
        d1q<any>(`SELECT installment_group_id, COUNT(*) as cnt FROM transactions WHERE installment_group_id IS NOT NULL AND date <= date('now') GROUP BY installment_group_id`),
      ]);
      const paidMap = Object.fromEntries(counts.map((r: any) => [r.installment_group_id, r.cnt]));
      res.json(rows.map((r: any) => mapInstallmentGroup(r, paidMap[r.id] || 0)));
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.post('/api/installments', async (req, res) => {
    const { description, totalInCents, installmentCount, startDate, accountId, creditCardId, category, memberId } = req.body;
    if (!description || !totalInCents || !installmentCount || !startDate)
      return res.status(400).json({ error: 'description, totalInCents, installmentCount e startDate são obrigatórios.' });
    const total = parseInt(totalInCents, 10);
    const count = Math.max(2, Math.min(48, parseInt(installmentCount, 10)));
    if (isNaN(total) || total <= 0) return res.status(400).json({ error: 'totalInCents inválido.' });

    const groupId = `ig-${Date.now()}`;
    const installmentAmount = Math.round(total / count);
    const cat = category || 'Compras';

    try {
      const stmts: { sql: string; params: (string | number | null)[] }[] = [
        {
          sql: 'INSERT INTO installment_groups (id,description,total_in_cents,installment_count,installment_amount_in_cents,category,account_id,credit_card_id,member_id,start_date) VALUES (?,?,?,?,?,?,?,?,?,?)',
          params: [groupId, description.trim(), total, count, installmentAmount, cat, accountId || null, creditCardId || null, memberId || null, startDate]
        }
      ];

      for (let i = 0; i < count; i++) {
        const d = new Date(startDate + 'T12:00:00');
        d.setMonth(d.getMonth() + i);
        const txDate = d.toISOString().split('T')[0];
        const txId = `tx-inst-${groupId}-${i + 1}`;
        const desc = `${description.trim()} (${i + 1}/${count})`;

        if (creditCardId) {
          const cardRows = await d1q<any>('SELECT * FROM credit_cards WHERE id = ?', [creditCardId]);
          if (cardRows.length) {
            const card = mapCreditCard(cardRows[0]);
            const instMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const invId = `inv-${creditCardId}-${instMonth.replace('-', '')}`;
            const dueYear = d.getMonth() + 1 === 12 ? d.getFullYear() + 1 : d.getFullYear();
            const dueMonth = ((d.getMonth() + 1) % 12) + 1;
            const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(card.dueDay).padStart(2, '0')}`;
            stmts.push({ sql: `INSERT OR IGNORE INTO invoices (id,credit_card_id,month,total_in_cents,status,due_date,created_at) VALUES (?,?,?,0,'open',?,datetime('now'))`, params: [invId, creditCardId, instMonth, dueDate] });
            stmts.push({ sql: 'UPDATE invoices SET total_in_cents = total_in_cents + ? WHERE id = ?', params: [installmentAmount, invId] });
            stmts.push({
              sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,credit_card_id,invoice_id,installment_number,installment_total,installment_group_id,member_id) VALUES (?,?,?,?,?,?,NULL,0,?,?,?,?,?,?)',
              params: [txId, installmentAmount, txDate, 'DES', cat, desc, creditCardId, invId, i + 1, count, groupId, memberId || null]
            });
          }
        } else {
          stmts.push({
            sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,installment_number,installment_total,installment_group_id,member_id) VALUES (?,?,?,?,?,?,?,0,?,?,?,?)',
            params: [txId, installmentAmount, txDate, 'DES', cat, desc, accountId || null, i + 1, count, groupId, memberId || null]
          });
          // Debit account only for past/current installments
          if (accountId && new Date(txDate) <= new Date()) {
            stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents - ? WHERE id = ?', params: [installmentAmount, accountId] });
          }
        }
      }

      await d1exec(stmts);
      await recalculateBudgets();
      res.status(201).json({ id: groupId });
    } catch (e: any) { console.error('[D1]', e.message); res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.delete('/api/installments/:groupId', async (req, res) => {
    const { groupId } = req.params;
    try {
      const rows = await d1q<any>('SELECT id FROM installment_groups WHERE id = ?', [groupId]);
      if (!rows.length) return res.status(404).json({ error: 'Grupo não encontrado.' });
      const todayStr = new Date().toISOString().split('T')[0];
      // Reverse account balance for future installments about to be deleted
      const futureTxs = await d1q<any>(
        'SELECT * FROM transactions WHERE installment_group_id = ? AND date > ?', [groupId, todayStr]
      );
      const stmts: { sql: string; params: (string | number | null)[] }[] = [];
      for (const tx of futureTxs) {
        if (tx.account_id && tx.type === 'DES') {
          stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [tx.amount_in_cents, tx.account_id] });
        }
        if (tx.invoice_id) {
          stmts.push({ sql: 'UPDATE invoices SET total_in_cents = MAX(0, total_in_cents - ?) WHERE id = ?', params: [tx.amount_in_cents, tx.invoice_id] });
        }
      }
      stmts.push({ sql: 'DELETE FROM transactions WHERE installment_group_id = ? AND date > ?', params: [groupId, todayStr] });
      stmts.push({ sql: 'DELETE FROM installment_groups WHERE id = ?', params: [groupId] });
      await d1exec(stmts);
      await recalculateBudgets();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // ── AI ADVISOR ─────────────────────────────────────────────────────────────

  app.post('/api/groq/advisor', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem obrigatória.' });
    const client = getGroqClient();
    await recalculateBudgets();
    const [accounts, budgets, goals, txRows] = await Promise.all([
      d1q<any>('SELECT * FROM accounts').then(r => r.map(mapAccount)),
      d1q<any>('SELECT * FROM budgets').then(r => r.map(mapBudget)),
      d1q<any>('SELECT * FROM goals').then(r => r.map(mapGoal)),
      d1q<any>('SELECT COUNT(*) as cnt FROM transactions'),
    ]);
    const totalBalance = accounts.reduce((s: number, a: FinancialAccount) => s + a.balanceInCents, 0);
    const budgetSummary = budgets.map((b: CategoryBudget) => `${b.category}: R$ ${(b.spentInCents / 100).toFixed(2)} de R$ ${(b.limitInCents / 100).toFixed(2)}`).join(', ');
    const goalsSummary = goals.map((g: FinancialGoal) => `${g.name}: R$ ${(g.currentInCents / 100).toFixed(2)} de R$ ${(g.targetInCents / 100).toFixed(2)}`).join(', ');
    const systemPrompt = `Você é um Consultor Financeiro de elite para brasileiros. Seja cortês, preciso e empático.\nContexto financeiro:\n- Patrimônio Total: R$ ${(totalBalance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n- Orçamentos: ${budgetSummary}\n- Metas: ${goalsSummary}\n- Total transações: ${txRows[0]?.cnt || 0}\n\nRetorne Markdown rico. Máximo 3 parágrafos ou bullet points acionáveis.`;

    if (!client) {
      return res.json({ reply: `### 💡 Análise MKS Open Finance\n\nPatrimônio: **R$ ${(totalBalance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**.\n\n> Configure GROQ_API_KEY no .env para IA personalizada.` });
    }
    try {
      const response = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
        temperature: 0.7, max_tokens: 1024
      });
      res.json({ reply: response.choices[0]?.message?.content || 'Sem resposta do modelo.' });
    } catch (e: any) {
      res.status(500).json({ error: 'Groq error', details: e.message });
    }
  });

  // ── CATEGORIZE ─────────────────────────────────────────────────────────────

  app.post('/api/groq/categorize', async (req, res) => {
    const { merchantName } = req.body;
    if (!merchantName) return res.status(400).json({ error: 'merchantName obrigatório.' });
    const client = getGroqClient();
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
      return { cleanDescription: cleanDesc, category };
    };
    if (!client) return res.json(classifyLocally(merchantName));
    try {
      const response = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: `Transação bancária: "${merchantName}". Retorne JSON com "cleanDescription" e "category" (Alimentação, Transporte, Moradia, Lazer, Saúde, Educação, Outros).` }],
        temperature: 0.1, max_tokens: 100, response_format: { type: 'json_object' }
      });
      const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
      res.json({ cleanDescription: parsed.cleanDescription || merchantName, category: parsed.category || 'Outros' });
    } catch { res.json(classifyLocally(merchantName)); }
  });

  // ── VITE / SPA ─────────────────────────────────────────────────────────────

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MKS Open Finance → http://0.0.0.0:${PORT}`);
    console.log(`[D1] mks-finance (${D1_DATABASE_ID})`);
    console.log(`[R2] ${R2_BUCKET}`);
    if (!process.env.GROQ_API_KEY) console.warn('[WARN] GROQ_API_KEY não configurada — IA em modo fallback.');
  });
}

startServer();
