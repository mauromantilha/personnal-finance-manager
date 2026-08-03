/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import crypto from 'crypto';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import Groq from 'groq-sdk';
import * as otplib from 'otplib';
import QRCode from 'qrcode';

const scryptAsync = promisify(crypto.scrypt);
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
  InstallmentGroup,
  Investment
} from './src/types';

// ─── Cloudflare D1 + R2 ──────────────────────────────────────────────────────

const CF_ACCOUNT_ID  = '9b61f609fee4408fd1c4344feaf9b16a';
const D1_DATABASE_ID = process.env.D1_DATABASE_ID  || '06790b84-c635-4111-918d-cbdad49a2f29';
const R2_BUCKET      = process.env.R2_BUCKET       || 'mks-finance-storage';
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

// ─── Pluggy Open Finance ──────────────────────────────────────────────────────

const PLUGGY_CLIENT_ID = process.env.PLUGGY_CLIENT_ID || '';
const PLUGGY_CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://financaslivre.com';

let _pluggyApiKey: string | null = null;
let _pluggyApiKeyExpiry = 0;

async function getPluggyApiKey(): Promise<string> {
  if (_pluggyApiKey && Date.now() < _pluggyApiKeyExpiry) return _pluggyApiKey;
  const resp = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET }),
  });
  if (!resp.ok) throw new Error(`Pluggy auth failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json() as { apiKey: string };
  _pluggyApiKey = data.apiKey;
  _pluggyApiKeyExpiry = Date.now() + 90 * 60 * 1000; // 90 min (TTL is 2h)
  return _pluggyApiKey;
}

async function pluggyReq<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const apiKey = await getPluggyApiKey();
  const resp = await fetch(`https://api.pluggy.ai${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
      ...(opts.headers || {}),
    },
  });
  if (!resp.ok) throw new Error(`Pluggy API ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<T>;
}

async function syncPluggyItem(itemId: string, connId: string): Promise<void> {
  const item = await pluggyReq<any>(`/items/${itemId}`);
  const { results: accs = [] } = await pluggyReq<any>(`/accounts?itemId=${itemId}`);

  for (const acc of accs) {
    const localAccId = `acc-plg-${acc.id}`;
    const existing = await d1q<any>('SELECT id FROM accounts WHERE id = ?', [localAccId]);
    const balanceCents = Math.round((acc.balance || 0) * 100);
    const accName = acc.name || item.connector?.name || 'Conta Open Finance';
    const bankName = item.connector?.name || 'Pluggy';

    if (!existing.length) {
      await d1q(
        'INSERT INTO accounts (id,name,type,bank_name,balance_in_cents,color,is_linked,branch,account_number,account_digit,manager_name,manager_phone) VALUES (?,?,?,?,?,?,1,NULL,NULL,NULL,NULL,NULL)',
        [localAccId, accName, 'CHECKING', bankName, balanceCents, '#3B82F6'],
      );
    } else {
      await d1q('UPDATE accounts SET balance_in_cents = ?, is_linked = 1 WHERE id = ?', [balanceCents, localAccId]);
    }

    const { results: txns = [] } = await pluggyReq<any>(`/transactions?accountId=${acc.id}&pageSize=100`);
    const stmts: { sql: string; params: (string | number | null)[] }[] = [];
    for (const tx of txns) {
      const txId = `tx-plg-${tx.id}`;
      const dup = await d1q<any>('SELECT id FROM transactions WHERE id = ?', [txId]);
      if (dup.length) continue;
      const txType = tx.type === 'CREDIT' ? 'REC' : 'DES';
      const amtCents = Math.round(Math.abs(tx.amount || 0) * 100);
      const txDate = (tx.date || tx.operationDate || new Date().toISOString()).split('T')[0];
      const desc = tx.description || tx.merchant?.name || 'Transação';
      const cat = tx.category?.description || classifyMerchant(desc);
      const merchant = tx.merchant?.name || null;
      stmts.push({
        sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,original_merchant_name) VALUES (?,?,?,?,?,?,?,1,?)',
        params: [txId, amtCents, txDate, txType, cat, desc, localAccId, merchant],
      });
    }
    if (stmts.length) await d1exec(stmts);
  }

  await d1q('UPDATE connections SET status = ?, last_synced_at = ? WHERE id = ?',
    ['CONNECTED', new Date().toISOString(), connId]);
  const institutionName = item.connector?.name || 'Banco';
  await d1q('INSERT OR IGNORE INTO alerts VALUES (?,?,?,?,?,?)', [
    `alert-plg-${Date.now()}`, 'SUCCESS',
    `🔗 Sincronização Concluída: ${institutionName}`,
    `${accs.length} conta(s) importada(s) via Pluggy Open Finance.`,
    new Date().toISOString(), 0,
  ]);
  await recalculateBudgets();
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
  return {
    id: r.id, name: r.name, type: r.type, bankName: r.bank_name,
    balanceInCents: r.balance_in_cents, color: r.color, isLinked: !!r.is_linked,
    branch: r.branch ?? null, accountNumber: r.account_number ?? null,
    accountDigit: r.account_digit ?? null, managerName: r.manager_name ?? null,
    managerPhone: r.manager_phone ?? null,
  };
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
function mapInvestment(r: any): Investment {
  return {
    id: r.id, name: r.name, ticker: r.ticker || null, assetClass: r.asset_class,
    institution: r.institution, investedInCents: r.invested_in_cents,
    currentValueInCents: r.current_value_in_cents, annualRate: r.annual_rate ?? null,
    startDate: r.start_date, maturityDate: r.maturity_date || null,
    accountId: r.account_id || null, notes: r.notes || null, createdAt: r.created_at,
  };
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

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = 'financas@financaslivre.com';

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [salt, hash] = stored.split(':');
    const hashBuf = Buffer.from(hash, 'hex');
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    return crypto.timingSafeEqual(hashBuf, derived);
  } catch { return false; }
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) { console.warn('[EMAIL] RESEND_API_KEY não configurado.'); return; }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  if (!resp.ok) console.error('[EMAIL] Resend error:', resp.status, await resp.text());
}

function buildInviteEmail(name: string, inviteUrl: string, with2fa: boolean): string {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
      <h2 style="color:#1e293b;margin-bottom:8px">Bem-vindo ao MKS Finanças, ${name}!</h2>
      <p style="color:#475569">Você foi convidado para acessar o sistema financeiro MKS.</p>
      ${with2fa ? '<p style="color:#475569">Sua conta inclui <strong>autenticação de dois fatores (2FA)</strong>. Após definir sua senha você receberá o QR Code para configurar o autenticador.</p>' : ''}
      <a href="${inviteUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">
        Criar minha senha →
      </a>
      <p style="margin-top:24px;color:#94a3b8;font-size:12px">Este link expira em 7 dias. Se você não esperava este e-mail, ignore-o.</p>
    </div>`;
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

  app.post('/api/auth/login', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Muitas tentativas. Tente em 15 minutos.' });
    const { email, password, totpCode } = req.body;
    if (!password) return res.status(401).json({ error: 'Senha obrigatória.' });

    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const setSession = () => {
      const token = createToken();
      res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}`);
    };

    // Admin login — no email required
    if (!email && password === APP_PASSWORD) {
      setSession();
      return res.json({ success: true, role: 'admin' });
    }

    // User login — email + password
    if (email) {
      try {
        const rows = await d1q<any>('SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND is_active = 1', [email]);
        if (!rows.length || !rows[0].password_hash) return res.status(401).json({ error: 'Credenciais inválidas.' });
        const user = rows[0];
        if (!(await verifyPassword(password, user.password_hash))) return res.status(401).json({ error: 'Credenciais inválidas.' });
        if (user.totp_secret) {
          if (!totpCode) return res.status(200).json({ requiresTOTP: true });
          const result = otplib.verifySync({ token: totpCode, secret: user.totp_secret });
          if (!result || (typeof result === 'object' && !result.valid)) return res.status(401).json({ error: 'Código 2FA inválido.' });
        }
        setSession();
        return res.json({ success: true, role: 'user', name: user.name });
      } catch (e: any) {
        return res.status(500).json({ error: 'Erro interno.', details: e.message });
      }
    }

    return res.status(401).json({ error: 'Credenciais inválidas.' });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.json({ success: true });
  });

  app.get('/api/auth/status', (req, res) => {
    const token = parseCookies(req)[COOKIE_NAME];
    res.json({ authenticated: !!(token && verifyToken(token)) });
  });

  // ── Invite completion (public — no auth) ─────────────────────────────────

  app.get('/api/invite/:token', async (req, res) => {
    const rows = await d1q<any>(`
      SELECT i.token, i.expires_at, i.used_at, u.name, u.email, u.totp_secret
      FROM invites i JOIN users u ON u.id = i.user_id WHERE i.token = ?`, [req.params.token]);
    if (!rows.length) return res.status(404).json({ error: 'Convite inválido.' });
    const inv = rows[0];
    if (inv.used_at) return res.status(410).json({ error: 'Este convite já foi utilizado.' });
    if (new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: 'Convite expirado.' });
    let qrDataUrl: string | null = null;
    if (inv.totp_secret) {
      const uri = otplib.generateURI({ secret: inv.totp_secret, label: inv.email, issuer: 'MKS Finanças' });
      qrDataUrl = await QRCode.toDataURL(uri, { width: 240 });
    }
    res.json({ name: inv.name, email: inv.email, has2fa: !!inv.totp_secret, qrDataUrl });
  });

  app.post('/api/invite/:token/complete', async (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres.' });
    const rows = await d1q<any>('SELECT i.*, u.id as user_id FROM invites i JOIN users u ON u.id = i.user_id WHERE i.token = ?', [req.params.token]);
    if (!rows.length || rows[0].used_at) return res.status(410).json({ error: 'Convite inválido ou já utilizado.' });
    if (new Date(rows[0].expires_at) < new Date()) return res.status(410).json({ error: 'Convite expirado.' });
    const hash = await hashPassword(password);
    await d1q('UPDATE users SET password_hash = ? WHERE id = ?', [hash, rows[0].user_id]);
    await d1q('UPDATE invites SET used_at = ? WHERE token = ?', [new Date().toISOString(), req.params.token]);
    res.json({ success: true });
  });

  // ── Pluggy webhook (public — no auth) ────────────────────────────────────
  app.post('/api/webhooks/pluggy', async (req, res) => {
    const { event, itemId } = req.body || {};
    if (event === 'item/updated' && itemId) {
      const conn = await d1q<any>('SELECT id FROM connections WHERE item_id = ?', [itemId]);
      if (conn.length) {
        d1q('UPDATE connections SET status = ? WHERE id = ?', ['SYNCING', conn[0].id]).catch(() => {});
        syncPluggyItem(itemId, conn[0].id).catch(console.error);
      }
    }
    res.json({ received: true });
  });

  // ── HEALTH CHECK (public — NOC use) ──────────────────────────────────────
  app.get('/api/health', async (_req, res) => {
    let db = false, storage = false, lgpdAccepted = false;
    try {
      await d1q('SELECT 1');
      db = true;
    } catch {}
    try {
      const cfToken = await getCFToken();
      const r = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}`,
        { headers: { Authorization: `Bearer ${cfToken}` }, signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) storage = true;
    } catch {}
    try {
      const rows = await d1q("SELECT id FROM lgpd_aceites WHERE policy_version = '2.0' LIMIT 1");
      lgpdAccepted = rows.length > 0;
    } catch {}
    res.json({
      ok: db && storage,
      db,
      storage,
      lgpd_accepted: lgpdAccepted,
      uptime: Math.floor(process.uptime()),
      ts: new Date().toISOString(),
      version: '1.0',
    });
  });

  // ── LGPD status (public — não expõe dados, só informa se aceite existe) ──
  app.get('/api/lgpd/status', async (_req, res) => {
    try {
      const rows = await d1q<any>(
        "SELECT policy_version, accepted_at FROM lgpd_aceites WHERE policy_version = '2.0' ORDER BY id DESC LIMIT 1"
      );
      res.json({
        accepted: rows.length > 0,
        version: '1.0',
        acceptedAt: rows[0]?.accepted_at ?? null,
      });
    } catch {
      res.json({ accepted: false, version: '1.0', acceptedAt: null });
    }
  });

  app.use('/api', requireAuth);

  // ── LGPD aceite (protegido — usuário deve estar autenticado) ──────────────
  app.post('/api/lgpd/aceite', async (req, res) => {
    const ip        = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    try {
      const existing = await d1q<any>(
        "SELECT id FROM lgpd_aceites WHERE policy_version = '2.0' LIMIT 1"
      );
      if (existing.length > 0) {
        return res.json({ ok: true, alreadyAccepted: true });
      }
      await d1q(
        "INSERT INTO lgpd_aceites (policy_version, ip_address, user_agent) VALUES ('2.0', ?, ?)",
        [ip, userAgent]
      );
      res.json({ ok: true, alreadyAccepted: false });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET ALL DATA ───────────────────────────────────────────────────────────

  app.get('/api/data', async (_req, res) => {
    try {
      await processRecurrences();
      await recalculateBudgets();
      await generateProactiveAlerts();
      const [accounts, connections, transactions, budgets, goals, alerts, chatHistory, categories, creditCards, invoices, recurrences, familyMembers, igRows, igCounts, investments] = await Promise.all([
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
        d1q<any>('SELECT * FROM investments ORDER BY start_date DESC').then(r => r.map(mapInvestment)),
      ]);
      const paidMap = Object.fromEntries(igCounts.map((r: any) => [r.installment_group_id, r.cnt]));
      const installmentGroups = igRows.map((r: any) => mapInstallmentGroup(r, paidMap[r.id] || 0));
      res.json({ accounts, connections, transactions, budgets, goals, alerts, chatHistory, categories, creditCards, invoices, recurrences, familyMembers, installmentGroups, investments });
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

    if (type === 'TRANS') {
      if (!destinationAccountId)
        return res.status(400).json({ error: 'destinationAccountId obrigatório para transferências.' });
      if (accountId && accountId === destinationAccountId)
        return res.status(400).json({ error: 'Conta de origem e destino devem ser diferentes.' });
      const destRows = await d1q('SELECT id FROM accounts WHERE id = ?', [destinationAccountId]);
      if (!destRows.length) return res.status(404).json({ error: 'Conta de destino não encontrada.' });
    }

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
    const body = req.body || {};
    const { name, bankName, type, color, branch, accountNumber, accountDigit, managerName, managerPhone } = body;
    if (!name || !bankName) return res.status(400).json({ error: 'name e bankName são obrigatórios.' });
    if (type && !VALID_ACC_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo inválido.' });
    try {
      const rows = await d1q('SELECT id FROM accounts WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Conta não encontrada.' });
      const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
      await d1q(
        `UPDATE accounts SET
          name=?, bank_name=?, type=?, color=?,
          branch=CASE WHEN ? THEN ? ELSE branch END,
          account_number=CASE WHEN ? THEN ? ELSE account_number END,
          account_digit=CASE WHEN ? THEN ? ELSE account_digit END,
          manager_name=CASE WHEN ? THEN ? ELSE manager_name END,
          manager_phone=CASE WHEN ? THEN ? ELSE manager_phone END
        WHERE id=?`,
        [
          name, bankName, type || 'CHECKING', color || '#6B7280',
          has('branch') ? 1 : 0, has('branch') ? (branch ?? null) : null,
          has('accountNumber') ? 1 : 0, has('accountNumber') ? (accountNumber ?? null) : null,
          has('accountDigit') ? 1 : 0, has('accountDigit') ? (accountDigit ?? null) : null,
          has('managerName') ? 1 : 0, has('managerName') ? (managerName ?? null) : null,
          has('managerPhone') ? 1 : 0, has('managerPhone') ? (managerPhone ?? null) : null,
          id,
        ],
      );
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.delete('/api/accounts/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const txCount = await d1q<any>('SELECT COUNT(*) as cnt FROM transactions WHERE account_id = ? OR destination_account_id = ?', [id, id]);
      if ((txCount[0]?.cnt || 0) > 0) return res.status(400).json({ error: 'Não é possível excluir conta com transações associadas.' });
      await d1q('DELETE FROM accounts WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  // ── CREATE ACCOUNT ─────────────────────────────────────────────────────────

  app.post('/api/accounts', async (req, res) => {
    const { name, type, bankName, balanceInCents, color, branch, accountNumber, accountDigit, managerName, managerPhone } = req.body;
    if (!name || !type || !bankName || balanceInCents === undefined)
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    if (!VALID_ACC_TYPES.includes(type))
      return res.status(400).json({ error: 'Tipo inválido.' });
    const balance = parseInt(balanceInCents, 10);
    // Saldo inicial pode ser negativo (conta no vermelho / cheque especial)
    if (isNaN(balance))
      return res.status(400).json({ error: 'Saldo inicial inválido (centavos inteiros).' });
    const id = `acc-usr-${Date.now()}`;
    try {
      await d1q(
        'INSERT INTO accounts (id,name,type,bank_name,balance_in_cents,color,is_linked,branch,account_number,account_digit,manager_name,manager_phone) VALUES (?,?,?,?,?,?,0,?,?,?,?,?)',
        [id, name, type, bankName, balance, color || '#6B7280', branch ?? null, accountNumber ?? null, accountDigit ?? null, managerName ?? null, managerPhone ?? null],
      );
      res.status(201).json({ id });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── RESET ──────────────────────────────────────────────────────────────────

  app.post('/api/reset', async (_req, res) => {
    try {
      await d1exec([
        { sql: 'DELETE FROM transactions' },
        { sql: 'DELETE FROM accounts' },
        { sql: 'DELETE FROM connections' },
        { sql: 'DELETE FROM budgets' },
        { sql: 'DELETE FROM goals' },
        { sql: 'DELETE FROM alerts' },
        { sql: 'DELETE FROM chat_history' },
        { sql: 'DELETE FROM credit_cards' },
        { sql: 'DELETE FROM invoices' },
        { sql: 'DELETE FROM recurrences' },
        { sql: 'DELETE FROM family_members' },
        { sql: 'DELETE FROM installment_groups' },
        { sql: 'DELETE FROM investments' },
        { sql: 'DELETE FROM invites' },
        { sql: 'DELETE FROM users' },
      ]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // ── USERS (Auth module) ────────────────────────────────────────────────────

  app.get('/api/users', async (_req, res) => {
    try {
      const rows = await d1q<any>('SELECT id, name, email, is_active, (totp_secret IS NOT NULL) as has_2fa, created_at FROM users ORDER BY created_at DESC');
      res.json(rows.map(u => ({ id: u.id, name: u.name, email: u.email, isActive: !!u.is_active, has2fa: !!u.has_2fa, createdAt: u.created_at })));
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.post('/api/users', async (req, res) => {
    const { name, email, with2fa } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nome e email são obrigatórios.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email inválido.' });
    try {
      const dup = await d1q<any>('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
      if (dup.length) return res.status(409).json({ error: 'Usuário com este email já existe.' });

      let totpSecret: string | null = null;
      let qrDataUrl: string | null = null;
      if (with2fa) {
        totpSecret = otplib.generateSecret();
        const uri = otplib.generateURI({ secret: totpSecret, label: email, issuer: 'MKS Finanças' });
        qrDataUrl = await QRCode.toDataURL(uri, { width: 240 });
      }

      const userId = `user-${Date.now()}`;
      await d1q('INSERT INTO users (id,name,email,password_hash,totp_secret,is_active,created_at) VALUES (?,?,?,NULL,?,1,?)',
        [userId, name, email, totpSecret, new Date().toISOString()]);

      const inviteToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await d1q('INSERT INTO invites (token,user_id,expires_at,used_at,created_at) VALUES (?,?,?,NULL,?)',
        [inviteToken, userId, expiresAt, new Date().toISOString()]);

      const inviteUrl = `${APP_URL}/?invite=${inviteToken}`;
      sendEmail(email, 'Convite — MKS Finanças', buildInviteEmail(name, inviteUrl, !!with2fa)).catch(console.error);

      res.json({ success: true, userId, qrDataUrl });
    } catch (e: any) { res.status(500).json({ error: 'Erro ao criar usuário.', details: e.message }); }
  });

  app.delete('/api/users/:id', async (req, res) => {
    try {
      await d1q('DELETE FROM invites WHERE user_id = ?', [req.params.id]);
      await d1q('DELETE FROM users WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
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

  // ── OPEN FINANCE (Pluggy) ──────────────────────────────────────────────────

  app.get('/api/open-finance/configured', (_req, res) => {
    res.json({ configured: !!(PLUGGY_CLIENT_ID && PLUGGY_CLIENT_SECRET) });
  });

  app.post('/api/open-finance/connect-token', async (_req, res) => {
    if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
      return res.status(400).json({ error: 'Pluggy não configurado. Adicione PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env e reinicie o servidor.' });
    }
    try {
      const data = await pluggyReq<{ accessToken: string }>('/connect_token', {
        method: 'POST',
        body: JSON.stringify({ clientUserId: 'mks-user', webhookUrl: `${APP_URL}/api/webhooks/pluggy` }),
      });
      res.json({ connectToken: data.accessToken });
    } catch (e: any) {
      res.status(500).json({ error: 'Pluggy connect token error', details: e.message });
    }
  });

  // Register item after Pluggy widget success
  app.post('/api/open-finance/connect', async (req, res) => {
    const { itemId, institutionName, logo } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId é obrigatório' });
    try {
      const existing = await d1q<any>('SELECT id FROM connections WHERE item_id = ?', [itemId]);
      let connId: string;
      if (existing.length) {
        connId = existing[0].id;
        await d1q('UPDATE connections SET status = ? WHERE id = ?', ['SYNCING', connId]);
      } else {
        connId = `conn-plg-${Date.now()}`;
        await d1q('INSERT INTO connections VALUES (?,?,?,?,?,?)',
          [connId, institutionName || 'Banco', logo || '🏦', 'SYNCING', itemId, null]);
      }
      res.json({ success: true, status: 'SYNCING', connId });
      syncPluggyItem(itemId, connId).catch(console.error);
    } catch (e: any) {
      res.status(500).json({ error: 'D1 error', details: e.message });
    }
  });

  // Manual re-sync
  app.post('/api/open-finance/sync/:itemId', async (req, res) => {
    const { itemId } = req.params;
    try {
      const conn = await d1q<any>('SELECT id FROM connections WHERE item_id = ?', [itemId]);
      if (!conn.length) return res.status(404).json({ error: 'Conexão não encontrada' });
      await d1q('UPDATE connections SET status = ? WHERE id = ?', ['SYNCING', conn[0].id]);
      res.json({ success: true, status: 'SYNCING' });
      syncPluggyItem(itemId, conn[0].id).catch(console.error);
    } catch (e: any) {
      res.status(500).json({ error: 'Sync error', details: e.message });
    }
  });

  // Disconnect
  app.delete('/api/open-finance/connections/:itemId', async (req, res) => {
    const { itemId } = req.params;
    if (PLUGGY_CLIENT_ID && PLUGGY_CLIENT_SECRET) {
      pluggyReq(`/items/${itemId}`, { method: 'DELETE' }).catch(() => {});
    }
    try {
      await d1q('DELETE FROM connections WHERE item_id = ?', [itemId]);
      res.json({ success: true });
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
    if (!name || !bankName || limitInCents === undefined || limitInCents === null)
      return res.status(400).json({ error: 'name, bankName e limitInCents são obrigatórios.' });
    const limit = parseInt(limitInCents, 10);
    if (isNaN(limit) || limit <= 0)
      return res.status(400).json({ error: 'Limite deve ser um valor positivo em centavos.' });
    const bill = parseInt(billingDay, 10) || 1;
    const due = parseInt(dueDay, 10) || 10;
    const id = `cc-usr-${Date.now()}`;
    try {
      await d1q(
        'INSERT INTO credit_cards (id,name,bank_name,last_four,limit_in_cents,billing_day,due_day,color,is_active) VALUES (?,?,?,?,?,?,?,?,1)',
        [id, name, bankName, lastFour || null, limit, bill, due, color || '#6366F1'],
      );
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
      if (inv.totalInCents <= 0) return res.status(400).json({ error: 'Fatura sem valor a pagar.' });

      const accRows = await d1q('SELECT id FROM accounts WHERE id = ?', [accountId]);
      if (!accRows.length) return res.status(404).json({ error: 'Conta de pagamento não encontrada.' });

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

  // ── OFX IMPORT ────────────────────────────────────────────────────────────

  app.post('/api/import/ofx', async (req, res) => {
    const { transactions, accountId } = req.body;
    if (!accountId || !Array.isArray(transactions) || !transactions.length)
      return res.status(400).json({ error: 'accountId e transactions[] são obrigatórios.' });
    try {
      const accRows = await d1q<any>('SELECT id FROM accounts WHERE id = ?', [accountId]);
      if (!accRows.length) return res.status(404).json({ error: 'Conta não encontrada.' });

      const stmts: { sql: string; params: (string | number | null)[] }[] = [];
      let imported = 0;
      let skipped = 0;

      for (const tx of transactions) {
        const txId = `tx-ofx-${tx.fitid}`;
        const dup = await d1q<any>('SELECT id FROM transactions WHERE id = ?', [txId]);
        if (dup.length) { skipped++; continue; }
        const txType = tx.type === 'CREDIT' ? 'REC' : 'DES';
        const cat = classifyMerchant(tx.memo || '');
        stmts.push({
          sql: 'INSERT INTO transactions (id,amount_in_cents,date,type,category,description,account_id,is_synced,original_merchant_name) VALUES (?,?,?,?,?,?,?,1,?)',
          params: [txId, tx.amountCents, tx.date, txType, cat, tx.memo, accountId, tx.memo],
        });
        const balDelta = txType === 'REC' ? tx.amountCents : -tx.amountCents;
        stmts.push({ sql: 'UPDATE accounts SET balance_in_cents = balance_in_cents + ? WHERE id = ?', params: [balDelta, accountId] });
        imported++;
      }
      if (stmts.length) {
        await d1exec(stmts);
        await recalculateBudgets();
      }
      res.json({ success: true, imported, skipped });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
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

  // ── DEBTS ──────────────────────────────────────────────────────────────────

  function mapDebt(r: any) {
    return {
      id: r.id,
      creditor: r.creditor,
      type: r.type,
      originalAmountInCents: r.original_amount_in_cents,
      currentAmountInCents: r.current_amount_in_cents,
      dueDate: r.due_date,
      monthsOverdue: r.months_overdue,
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at,
    };
  }

  app.get('/api/debts', async (_req, res) => {
    try {
      const rows = await d1q<any>('SELECT * FROM debts ORDER BY current_amount_in_cents DESC');
      res.json({ debts: rows.map(mapDebt) });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.post('/api/debts', async (req, res) => {
    const { creditor, type, originalAmountInCents, currentAmountInCents,
            dueDate, monthsOverdue, status, notes } = req.body;
    if (!creditor || !type || !originalAmountInCents || !currentAmountInCents)
      return res.status(400).json({ error: 'creditor, type, originalAmountInCents e currentAmountInCents são obrigatórios.' });
    const id = `debt-${Date.now()}`;
    try {
      await d1q(
        'INSERT INTO debts (id,creditor,type,original_amount_in_cents,current_amount_in_cents,due_date,months_overdue,status,notes) VALUES (?,?,?,?,?,?,?,?,?)',
        [id, creditor, type, originalAmountInCents, currentAmountInCents,
         dueDate ?? null, monthsOverdue ?? 0, status ?? 'ativo', notes ?? null],
      );
      res.status(201).json({ id });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.put('/api/debts/:id', async (req, res) => {
    const { id } = req.params;
    const { creditor, type, originalAmountInCents, currentAmountInCents,
            dueDate, monthsOverdue, status, notes } = req.body;
    try {
      const rows = await d1q('SELECT id FROM debts WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Dívida não encontrada.' });
      await d1q(
        'UPDATE debts SET creditor=?,type=?,original_amount_in_cents=?,current_amount_in_cents=?,due_date=?,months_overdue=?,status=?,notes=? WHERE id=?',
        [creditor, type, originalAmountInCents, currentAmountInCents,
         dueDate ?? null, monthsOverdue ?? 0, status ?? 'ativo', notes ?? null, id],
      );
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.delete('/api/debts/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await d1q('DELETE FROM debts WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.post('/api/debts/analyze', async (_req, res) => {
    try {
      const [debtRows, accounts, txRows] = await Promise.all([
        d1q<any>("SELECT * FROM debts WHERE status != 'quitado'"),
        d1q<any>('SELECT * FROM accounts').then(r => r.map(mapAccount)),
        d1q<any>("SELECT * FROM transactions WHERE date LIKE ?", [`${new Date().toISOString().slice(0, 7)}%`]),
      ]);
      const debts = debtRows.map(mapDebt);
      if (!debts.length) return res.json({ analysis: 'Nenhuma dívida ativa cadastrada.' });

      const brlFmt = (n: number) => `R$ ${(n / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      const totalDebt = debts.reduce((s: number, d: any) => s + d.currentAmountInCents, 0);
      const netWorth = accounts.reduce((s: number, a: FinancialAccount) => s + a.balanceInCents, 0);
      const monthIncome = txRows.filter((t: any) => t.type === 'REC').reduce((s: number, t: any) => s + t.amount_in_cents, 0);
      const monthExpense = txRows.filter((t: any) => t.type === 'DES').reduce((s: number, t: any) => s + t.amount_in_cents, 0);

      const client = getGroqClient();
      if (!client) {
        return res.json({
          analysis: `### Análise rápida\n\nTotal de dívidas: **${brlFmt(totalDebt)}** · Patrimônio: **${brlFmt(netWorth)}**.\n\nConfigure GROQ_API_KEY no .env para estratégia completa com IA.`,
        });
      }

      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        max_tokens: 2500,
        messages: [
          {
            role: 'system',
            content: `Você é especialista em negociação de dívidas no Brasil. Patrimônio: ${brlFmt(netWorth)}. Receita mês: ${brlFmt(monthIncome)}. Despesas mês: ${brlFmt(monthExpense)}. Total dívidas: ${brlFmt(totalDebt)}. Dívidas: ${JSON.stringify(debts.map((d: any) => ({ credor: d.creditor, tipo: d.type, atual: brlFmt(d.currentAmountInCents), atraso: d.monthsOverdue, status: d.status })))}. Responda em Markdown, máx 700 palavras.`,
          },
          { role: 'user', content: 'Analise minhas dívidas e proponha estratégias de resolução.' },
        ],
      });
      const analysis = (completion.choices[0]?.message?.content || '') +
        '\n\n---\n*⚠️ Orientações gerais — não substituem aconselhamento financeiro ou jurídico profissional.*';
      res.json({ analysis });
    } catch (e: any) {
      if (String(e?.message || '').includes('429')) return res.status(429).json({ error: 'RATE_LIMIT' });
      res.status(500).json({ error: 'Erro na análise.', details: e.message });
    }
  });

  // ── INVESTMENTS ────────────────────────────────────────────────────────────

  app.get('/api/investments', async (_req, res) => {
    try {
      const rows = await d1q<any>('SELECT * FROM investments ORDER BY start_date DESC');
      res.json(rows.map(mapInvestment));
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.post('/api/investments', async (req, res) => {
    const { name, ticker, assetClass, institution, investedInCents, currentValueInCents, annualRate, startDate, maturityDate, accountId, notes } = req.body;
    if (!name || !institution || !startDate)
      return res.status(400).json({ error: 'name, institution e startDate são obrigatórios.' });
    const invested = parseInt(investedInCents, 10) || 0;
    const current = parseInt(currentValueInCents, 10) || invested;
    const id = `inv-${Date.now()}`;
    const VALID_CLASSES = ['fixed_income', 'stocks', 'fii', 'crypto', 'international', 'other'];
    const cls = VALID_CLASSES.includes(assetClass) ? assetClass : 'other';
    try {
      await d1q(
        'INSERT INTO investments (id,name,ticker,asset_class,institution,invested_in_cents,current_value_in_cents,annual_rate,start_date,maturity_date,account_id,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, name.trim(), ticker?.trim() || null, cls, institution.trim(), invested, current, annualRate ?? null, startDate, maturityDate || null, accountId || null, notes?.trim() || null]
      );
      res.status(201).json({ id });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.put('/api/investments/:id', async (req, res) => {
    const { id } = req.params;
    const { name, ticker, institution, currentValueInCents, annualRate, maturityDate, notes } = req.body;
    try {
      const rows = await d1q('SELECT id FROM investments WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Investimento não encontrado.' });
      await d1q(
        'UPDATE investments SET name=COALESCE(?,name), ticker=COALESCE(?,ticker), institution=COALESCE(?,institution), current_value_in_cents=COALESCE(?,current_value_in_cents), annual_rate=COALESCE(?,annual_rate), maturity_date=COALESCE(?,maturity_date), notes=COALESCE(?,notes) WHERE id=?',
        [name?.trim() || null, ticker?.trim() || null, institution?.trim() || null,
         currentValueInCents !== undefined ? parseInt(currentValueInCents, 10) : null,
         annualRate !== undefined ? annualRate : null, maturityDate || null, notes?.trim() || null, id]
      );
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'D1 error', details: e.message }); }
  });

  app.delete('/api/investments/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const rows = await d1q('SELECT id FROM investments WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Investimento não encontrado.' });
      await d1q('DELETE FROM investments WHERE id = ?', [id]);
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

  // ── PREDICTIVE AI ANALYST ─────────────────────────────────────────────────

  app.post('/api/ai/predictive', async (_req, res) => {
    const client = getGroqClient();
    try {
      await recalculateBudgets();
      const now = new Date();
      const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevPrefix = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
      const ninetyDaysAgo = new Date(now); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const since = ninetyDaysAgo.toISOString().split('T')[0];

      const [accounts, budgets, goals, investments, creditCards, invoices, recurrences,
        monthTxs, prevMonthTxs, topCategories] = await Promise.all([
        d1q<any>('SELECT * FROM accounts').then(r => r.map(mapAccount)),
        d1q<any>('SELECT * FROM budgets').then(r => r.map(mapBudget)),
        d1q<any>('SELECT * FROM goals').then(r => r.map(mapGoal)),
        d1q<any>('SELECT * FROM investments ORDER BY start_date DESC').then(r => r.map(mapInvestment)),
        d1q<any>('SELECT * FROM credit_cards WHERE is_active = 1').then(r => r.map(mapCreditCard)),
        d1q<any>('SELECT * FROM invoices ORDER BY month DESC').then(r => r.map(mapInvoice)),
        d1q<any>('SELECT * FROM recurrences WHERE is_active = 1').then(r => r.map(mapRecurrence)),
        d1q<any>(`SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC`, [`${monthPrefix}%`]).then(r => r.map(mapTransaction)),
        d1q<any>(`SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC`, [`${prevPrefix}%`]).then(r => r.map(mapTransaction)),
        d1q<any>(`SELECT category, type, SUM(amount_in_cents) as total FROM transactions WHERE date >= ? AND type = 'DES' GROUP BY category ORDER BY total DESC LIMIT 10`, [since]),
      ]);

      const hasData = accounts.length > 0 || monthTxs.length > 0 || prevMonthTxs.length > 0 || investments.length > 0;
      if (!hasData) {
        return res.json({
          insufficient_data: true,
          resumo_executivo: 'Nenhum dado financeiro encontrado. Cadastre contas e registre movimentações para receber a análise.',
          score_saude: { valor: 0, classificacao: 'Sem dados', justificativa: 'Dados insuficientes — adicione contas, transações ou investimentos.' },
          alertas: [{ nivel: 'INFO', titulo: 'Sistema sem dados', descricao: 'Não há contas, transações ou investimentos registrados para análise.', acao_sugerida: 'Acesse "Módulo 1: Contas & Ledger" para começar.' }],
          analise_gastos: { resumo: 'Dados insuficientes.', ponto_atencao: null, top_categorias: [] },
          analise_investimentos: { resumo: 'Dados insuficientes.', diversificacao: 'Sem investimentos', pontos: [], sugestoes: [] },
          recomendacoes: [],
          plano_acao: [],
          generatedAt: now.toISOString(),
        });
      }

      const brl = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      const pct = (a: number, b: number) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : 'N/A';

      const netWorth = accounts.reduce((s: number, a: FinancialAccount) => s + a.balanceInCents, 0);
      const monthIncome = monthTxs.filter((t: Transaction) => t.type === 'REC').reduce((s: number, t: Transaction) => s + t.amountInCents, 0);
      const monthExpense = monthTxs.filter((t: Transaction) => t.type === 'DES').reduce((s: number, t: Transaction) => s + t.amountInCents, 0);
      const prevIncome = prevMonthTxs.filter((t: Transaction) => t.type === 'REC').reduce((s: number, t: Transaction) => s + t.amountInCents, 0);
      const prevExpense = prevMonthTxs.filter((t: Transaction) => t.type === 'DES').reduce((s: number, t: Transaction) => s + t.amountInCents, 0);
      const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0;
      const totalInvested = investments.reduce((s: number, i: Investment) => s + i.investedInCents, 0);
      const totalInvestValue = investments.reduce((s: number, i: Investment) => s + i.currentValueInCents, 0);
      const totalRecurring = recurrences.filter((r: Recurrence) => r.type === 'DES').reduce((s: number, r: Recurrence) => s + r.amountInCents, 0);
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const creditUsed = creditCards.reduce((s: number, c: CreditCard) => {
        const inv = invoices.find((i: Invoice) => i.creditCardId === c.id && i.month === currentMonth);
        return s + (inv?.totalInCents || 0);
      }, 0);
      const creditLimit = creditCards.reduce((s: number, c: CreditCard) => s + c.limitInCents, 0);

      const context = {
        data_referencia: now.toLocaleDateString('pt-BR'),
        patrimonio_liquido: brl(netWorth),
        contas: accounts.map((a: FinancialAccount) => ({ nome: a.name, banco: a.bankName, tipo: a.type, saldo: brl(a.balanceInCents) })),
        mes_atual: {
          receitas: brl(monthIncome), despesas: brl(monthExpense),
          saldo_mes: brl(monthIncome - monthExpense),
          taxa_poupanca: `${savingsRate.toFixed(1)}%`,
        },
        mes_anterior: {
          receitas: brl(prevIncome), despesas: brl(prevExpense),
          variacao_despesa: prevExpense > 0 ? `${(((monthExpense - prevExpense) / prevExpense) * 100).toFixed(1)}%` : 'N/A',
        },
        orcamentos: budgets.map((b: CategoryBudget) => ({
          categoria: b.category,
          limite: brl(b.limitInCents),
          gasto: brl(b.spentInCents),
          percentual: pct(b.spentInCents, b.limitInCents),
          status: b.spentInCents >= b.limitInCents ? 'ESTOURADO' : b.spentInCents >= b.limitInCents * 0.8 ? 'ATENCAO' : 'OK',
        })),
        metas: goals.map((g: FinancialGoal) => ({
          nome: g.name,
          meta: brl(g.targetInCents),
          atual: brl(g.currentInCents),
          progresso: pct(g.currentInCents, g.targetInCents),
          data_alvo: g.targetDate,
        })),
        investimentos: {
          total_aplicado: brl(totalInvested),
          valor_atual: brl(totalInvestValue),
          rentabilidade_total: totalInvested > 0 ? `${(((totalInvestValue - totalInvested) / totalInvested) * 100).toFixed(2)}%` : 'N/A',
          posicoes: investments.map((i: Investment) => ({
            nome: i.name, classe: i.assetClass, instituicao: i.institution,
            aplicado: brl(i.investedInCents), atual: brl(i.currentValueInCents),
            taxa_anual: i.annualRate ? `${i.annualRate}% a.a.` : null,
          })),
        },
        cartoes_credito: creditCards.map((c: CreditCard) => {
          const inv = invoices.find((i: Invoice) => i.creditCardId === c.id && i.month === currentMonth);
          const used = inv?.totalInCents || 0;
          return { nome: c.name, limite: brl(c.limitInCents), fatura_atual: brl(used), utilizacao: pct(used, c.limitInCents) };
        }),
        utilizacao_total_credito: `${creditLimit > 0 ? ((creditUsed / creditLimit) * 100).toFixed(1) : 0}%`,
        custos_fixos_mensais: brl(totalRecurring),
        top_categorias_despesa_90dias: topCategories.map((r: any) => ({
          categoria: r.category, total: brl(r.total), participacao: pct(r.total, prevExpense + monthExpense),
        })),
      };

      const systemPrompt = `Você é um Analista Financeiro Sênior e Assessor de Investimentos Certificado (CFP), especializado em finanças pessoais e planejamento patrimonial no Brasil.

REGRAS ABSOLUTAS — VIOLÁ-LAS É INACEITÁVEL:
1. Baseie TODA análise EXCLUSIVAMENTE nos dados JSON fornecidos. NUNCA invente valores, tendências ou fatos não presentes nos dados.
2. Se dados forem insuficientes para uma conclusão, escreva explicitamente: "Dados insuficientes para análise neste item."
3. Cada insight DEVE citar números reais do JSON (valores em R$, percentuais, nomes de contas).
4. Responda SEMPRE em Português Brasileiro, linguagem profissional mas acessível.
5. Retorne SOMENTE JSON válido. Nenhum texto fora do JSON.
6. Seja preciso: sem conselhos genéricos. Toda recomendação deve ser específica ao perfil do usuário.
7. Nível de confiança: só afirme o que os dados confirmam. Hipóteses devem ser indicadas como tal.

ESTRUTURA JSON OBRIGATÓRIA DE RETORNO:
{
  "resumo_executivo": "string — 2 frases sobre a situação financeira atual com números reais",
  "score_saude": {
    "valor": 0-100,
    "classificacao": "Excelente|Bom|Regular|Crítico",
    "justificativa": "string baseada nos dados"
  },
  "alertas": [
    { "nivel": "CRITICO|ATENCAO|INFO", "titulo": "string", "descricao": "string com números reais", "acao_sugerida": "string" }
  ],
  "analise_gastos": {
    "resumo": "string",
    "ponto_atencao": "string|null",
    "top_categorias": [{ "categoria": "string", "valor": "string", "avaliacao": "string" }]
  },
  "analise_investimentos": {
    "resumo": "string",
    "diversificacao": "Boa|Média|Fraca|Sem investimentos",
    "pontos": ["string"],
    "sugestoes": ["string — baseadas nos dados, não em suposições"]
  },
  "recomendacoes": [
    { "prioridade": 1, "titulo": "string", "descricao": "string com referência aos dados", "impacto": "Alto|Médio|Baixo", "prazo": "Imediato|30 dias|90 dias|Longo prazo" }
  ],
  "plano_acao": [
    { "ordem": 1, "acao": "string específica", "motivo": "string baseado nos dados" }
  ]
}`;

      if (!client) {
        return res.json({
          insufficient_data: true,
          resumo_executivo: `Patrimônio líquido: ${brl(netWorth)}. Configure GROQ_API_KEY no .env para análise completa com IA.`,
          score_saude: { valor: 0, classificacao: 'Sem dados', justificativa: 'IA não configurada — score indisponível.' },
          alertas: [{ nivel: 'INFO', titulo: 'IA não configurada', descricao: 'Adicione GROQ_API_KEY ao .env para habilitar análise preditiva.', acao_sugerida: 'Configure a variável de ambiente GROQ_API_KEY.' }],
          analise_gastos: { resumo: 'IA não disponível.', ponto_atencao: null, top_categorias: [] },
          analise_investimentos: { resumo: 'IA não disponível.', diversificacao: 'Sem investimentos', pontos: [], sugestoes: [] },
          recomendacoes: [],
          plano_acao: [],
          generatedAt: now.toISOString(),
        });
      }

      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analise estes dados financeiros e retorne o JSON conforme estrutura definida:\n\n${JSON.stringify(context, null, 2)}` },
        ],
        temperature: 0.2,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      const analysis = JSON.parse(raw);
      res.json({ ...analysis, generatedAt: now.toISOString() });
    } catch (e: any) {
      console.error('[PREDICTIVE AI]', e.message);
      res.status(500).json({ error: 'Erro na análise preditiva.', details: e.message });
    }
  });

  // ── FINANCIAL CHAT ────────────────────────────────────────────────────────

  app.post('/api/ai/financial-chat', async (req, res) => {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem obrigatória.' });
    const client = getGroqClient();
    if (!client) return res.json({ reply: 'Configure GROQ_API_KEY no .env para habilitar o chat.' });

    try {
      const now = new Date();
      const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [accounts, investments, creditCards, invoices, recurrences, monthTxs, budgets] = await Promise.all([
        d1q<any>('SELECT * FROM accounts').then(r => r.map(mapAccount)),
        d1q<any>('SELECT * FROM investments').then(r => r.map(mapInvestment)),
        d1q<any>('SELECT * FROM credit_cards WHERE is_active = 1').then(r => r.map(mapCreditCard)),
        d1q<any>('SELECT * FROM invoices WHERE month = ?', [monthPrefix]).then(r => r.map(mapInvoice)),
        d1q<any>('SELECT * FROM recurrences WHERE is_active = 1 AND type = ?', ['DES']).then(r => r.map(mapRecurrence)),
        d1q<any>('SELECT * FROM transactions WHERE date LIKE ?', [`${monthPrefix}%`]).then(r => r.map(mapTransaction)),
        d1q<any>('SELECT * FROM budgets').then(r => r.map(mapBudget)),
      ]);

      const brl = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      const netWorth = accounts.reduce((s: number, a: FinancialAccount) => s + a.balanceInCents, 0);
      const monthIncome = monthTxs.filter((t: Transaction) => t.type === 'REC').reduce((s: number, t: Transaction) => s + t.amountInCents, 0);
      const monthExpense = monthTxs.filter((t: Transaction) => t.type === 'DES').reduce((s: number, t: Transaction) => s + t.amountInCents, 0);
      const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0;
      const totalInvested = investments.reduce((s: number, i: Investment) => s + i.investedInCents, 0);
      const totalInvestValue = investments.reduce((s: number, i: Investment) => s + i.currentValueInCents, 0);
      const creditUsed = creditCards.reduce((s: number, c: CreditCard) => {
        const inv = invoices.find((i: Invoice) => i.creditCardId === c.id);
        return s + (inv?.totalInCents || 0);
      }, 0);
      const creditLimit = creditCards.reduce((s: number, c: CreditCard) => s + c.limitInCents, 0);
      const fixedCosts = recurrences.reduce((s: number, r: Recurrence) => s + r.amountInCents, 0);
      const overBudgets = budgets.filter((b: CategoryBudget) => b.spentInCents >= b.limitInCents).map((b: CategoryBudget) => b.category);

      const userSummary = `=== POSIÇÃO FINANCEIRA DO USUÁRIO (${now.toLocaleDateString('pt-BR')}) ===
Patrimônio líquido: ${brl(netWorth)}
Receita mês atual: ${brl(monthIncome)}
Despesa mês atual: ${brl(monthExpense)}
Saldo do mês: ${brl(monthIncome - monthExpense)}
Taxa de poupança: ${savingsRate.toFixed(1)}%
Custos fixos mensais: ${brl(fixedCosts)}
Investimentos — aplicado: ${brl(totalInvested)} | valor atual: ${brl(totalInvestValue)}${totalInvested > 0 ? ` | rentab.: ${(((totalInvestValue - totalInvested) / totalInvested) * 100).toFixed(2)}%` : ''}
Investimentos por classe: ${investments.length === 0 ? 'nenhum registrado' : [...new Set(investments.map((i: Investment) => i.assetClass))].map((cls: string) => { const tot = investments.filter((i: Investment) => i.assetClass === cls).reduce((s: number, i: Investment) => s + i.currentValueInCents, 0); return `${cls} (${brl(tot)})`; }).join(', ')}
Cartões de crédito: limite ${brl(creditLimit)} | fatura atual ${brl(creditUsed)} | utilização ${creditLimit > 0 ? ((creditUsed / creditLimit) * 100).toFixed(1) : 0}%
Orçamentos estourados este mês: ${overBudgets.length === 0 ? 'nenhum' : overBudgets.join(', ')}
Contas bancárias: ${accounts.map((a: FinancialAccount) => `${a.name} (${brl(a.balanceInCents)})`).join(', ') || 'nenhuma'}`;

      const systemPrompt = `Você é um Assessor Financeiro Especialista e CFP (Certified Financial Planner) com profundo conhecimento do mercado financeiro brasileiro. Seu nome é MKS Finance AI.

SUAS ESPECIALIDADES:
- Planejamento financeiro pessoal e patrimonial
- Renda fixa: Tesouro Direto, CDB, LCI/LCA, debêntures, CRI/CRA, FIDC
- Renda variável: ações B3, ETFs, BDRs, análise fundamentalista e técnica
- Fundos de investimento: FIIs, fundos de ações, multimercado, renda fixa
- Previdência: PGBL, VGBL, regime de tributação
- Câmbio, macroeconomia, política monetária (Copom/Selic), inflação (IPCA/IGPM)
- Mercado de capitais: IPO, follow-on, debêntures, CRI/CRA
- Tributação de investimentos: IR, come-cotas, isenções
- Finanças comportamentais e educação financeira

DADOS REAIS DO USUÁRIO (use sempre que relevante):
${userSummary}

REGRAS:
1. Responda em Português Brasileiro, tom profissional mas acessível.
2. Quando referenciar dados do usuário, cite os números reais acima.
3. Para informações de mercado (cotações, taxas atuais), deixe claro que são dados do seu treinamento — sugira verificar fontes atualizadas.
4. Seja específico: evite respostas genéricas. Adapte ao perfil financeiro real do usuário.
5. Se a pergunta não tiver relação com finanças/economia, redirecione gentilmente.
6. Máximo de 400 palavras por resposta. Se precisar de mais, estruture em tópicos.`;

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...history.slice(-12).map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
        { role: 'user' as const, content: message },
      ];

      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.5,
        max_tokens: 1500,
      });

      res.json({ reply: completion.choices[0]?.message?.content || 'Não foi possível gerar resposta.' });
    } catch (e: any) {
      console.error('[FINANCIAL CHAT]', e.message);
      res.status(500).json({ error: 'Erro no chat financeiro.', details: e.message });
    }
  });

  // ── MARKET DATA ────────────────────────────────────────────────────────────

  const marketCache = new Map<string, { data: any; expires: number }>();

  function getCached<T>(key: string): T | null {
    const entry = marketCache.get(key);
    if (entry && entry.expires > Date.now()) return entry.data as T;
    return null;
  }
  function setCache(key: string, data: any, ttlMs: number) {
    marketCache.set(key, { data, expires: Date.now() + ttlMs });
  }

  function parseRSS(xml: string): { title: string; link: string; pubDate: string; description: string; source: string }[] {
    const items: { title: string; link: string; pubDate: string; description: string; source: string }[] = [];
    const sourceMatch = xml.match(/<channel>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i);
    const sourceName = sourceMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || 'Notícia';
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(xml)) !== null && items.length < 8) {
      const block = m[1];
      const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, '').trim();
      const link = (block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || block.match(/<guid[^>]*>(https?:\/\/[^\s<]+)<\/guid>/i)?.[1] || '').trim();
      const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim();
      const description = (block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim().slice(0, 180);
      if (title && link) items.push({ title, link, pubDate, description, source: sourceName });
    }
    return items;
  }

  app.get('/api/market/quotes', async (_req, res) => {
    const cached = getCached<any>('quotes');
    if (cached) return res.json(cached);
    try {
      const tickers = 'IBOV,PETR4,VALE3,ITUB4,BBDC4,WEGE3,ABEV3';
      const r = await fetch(`https://brapi.dev/api/quote/${tickers}?range=1d&interval=1d&fundamental=false`, {
        headers: { 'User-Agent': 'MKSFinance/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`brapi ${r.status}`);
      const data = await r.json();
      const quotes = (data.results || []).map((q: any) => ({
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        price: q.regularMarketPrice,
        change: q.regularMarketChangePercent,
        changeAbs: q.regularMarketChange,
        updatedAt: q.regularMarketTime,
      }));
      const payload = { quotes, fetchedAt: new Date().toISOString() };
      setCache('quotes', payload, 5 * 60 * 1000);
      res.json(payload);
    } catch (e: any) {
      const stale = marketCache.get('quotes');
      if (stale) return res.json({ ...stale.data, stale: true });
      console.error('[MARKET/QUOTES]', e.message);
      res.json({ quotes: [], fetchedAt: null, error: e.message });
    }
  });

  app.get('/api/market/rates', async (_req, res) => {
    const cached = getCached<any>('rates');
    if (cached) return res.json(cached);
    try {
      const [currencyRes, selicRes] = await Promise.allSettled([
        fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL', { signal: AbortSignal.timeout(6000) }),
        fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', { signal: AbortSignal.timeout(6000) }),
      ]);

      let currencies: any = {};
      if (currencyRes.status === 'fulfilled' && currencyRes.value.ok) {
        const d = await currencyRes.value.json();
        currencies = {
          USD: { bid: parseFloat(d.USDBRL?.bid || '0'), pctChange: parseFloat(d.USDBRL?.pctChange || '0') },
          EUR: { bid: parseFloat(d.EURBRL?.bid || '0'), pctChange: parseFloat(d.EURBRL?.pctChange || '0') },
          BTC: { bid: parseFloat(d.BTCBRL?.bid || '0'), pctChange: parseFloat(d.BTCBRL?.pctChange || '0') },
        };
      }

      let selic = null;
      if (selicRes.status === 'fulfilled' && selicRes.value.ok) {
        const d = await selicRes.value.json();
        selic = parseFloat(d[0]?.valor?.replace(',', '.') || '0');
      }

      const payload = { currencies, selic, fetchedAt: new Date().toISOString() };
      setCache('rates', payload, 5 * 60 * 1000);
      res.json(payload);
    } catch (e: any) {
      const stale = marketCache.get('rates');
      if (stale) return res.json({ ...stale.data, stale: true });
      console.error('[MARKET/RATES]', e.message);
      res.json({ currencies: {}, selic: null, fetchedAt: null, error: e.message });
    }
  });

  app.get('/api/market/news', async (_req, res) => {
    const cached = getCached<any>('news');
    if (cached) return res.json(cached);
    try {
      const feeds = [
        { url: 'https://www.infomoney.com.br/feed/', name: 'InfoMoney' },
        { url: 'https://g1.globo.com/rss/g1/economia/', name: 'G1 Economia' },
        { url: 'https://valor.globo.com/financas/rss', name: 'Valor Econômico' },
        { url: 'https://valor.globo.com/mercados/rss', name: 'Valor — Mercados' },
      ];
      const results = await Promise.allSettled(
        feeds.map(f => fetch(f.url, { headers: { 'User-Agent': 'MKSFinance/1.0' }, signal: AbortSignal.timeout(8000) })
          .then(r => r.text()).then(xml => parseRSS(xml)))
      );
      const allItems: any[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          r.value.forEach(item => allItems.push({ ...item, source: feeds[i].name }));
        }
      });
      allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      const payload = { items: allItems.slice(0, 10), fetchedAt: new Date().toISOString() };
      setCache('news', payload, 15 * 60 * 1000);
      res.json(payload);
    } catch (e: any) {
      const stale = marketCache.get('news');
      if (stale) return res.json({ ...stale.data, stale: true });
      console.error('[MARKET/NEWS]', e.message);
      res.json({ items: [], fetchedAt: null, error: e.message });
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

  // ── Static legal pages (must come before SPA catch-all) ──────────────────
  const landingDir = path.join(process.cwd(), 'landing');
  app.get('/termos',      (_req, res) => res.sendFile(path.join(landingDir, 'termos.html')));
  app.get('/privacidade', (_req, res) => res.sendFile(path.join(landingDir, 'privacidade.html')));
  app.get('/lgpd',        (_req, res) => res.sendFile(path.join(landingDir, 'lgpd.html')));

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
