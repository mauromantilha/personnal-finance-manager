import { describe, it, expect } from 'vitest';
import {
  mapTransaction, mapCreditCard, mapInvoice, mapRecurrence,
  type DbTransaction, type DbCreditCard, type DbInvoice, type DbRecurrence,
} from './mappers';

describe('mapTransaction', () => {
  const row: DbTransaction = {
    id: 'tx-1', amount_in_cents: 12345, date: '2026-05-10', type: 'DES',
    category: 'Alimentação', description: 'Mercado', account_id: 'acc-1',
    destination_account_id: null, is_synced: 0, original_merchant_name: null,
    credit_card_id: null, invoice_id: null, installment_number: null,
    installment_total: null, installment_group_id: null, document_key: null,
    member_id: null, created_at: '2026-05-10T12:00:00Z',
    income_type: null, payer: null, profession: null,
  };

  it('mapeia centavos sem alteração e converte snake_case → camelCase', () => {
    const t = mapTransaction(row);
    expect(t.amountInCents).toBe(12345);
    expect(t.accountId).toBe('acc-1');
    expect(t.category).toBe('Alimentação');
  });

  it('coage is_synced (0/1) para boolean', () => {
    expect(mapTransaction(row).isSynced).toBe(false);
    expect(mapTransaction({ ...row, is_synced: 1 }).isSynced).toBe(true);
  });

  it('normaliza campos opcionais ausentes para null', () => {
    const t = mapTransaction({ ...row, income_type: undefined as any });
    expect(t.incomeType).toBeNull();
  });
});

describe('mapCreditCard', () => {
  const row: DbCreditCard = {
    id: 'cc-1', name: 'Nubank', bank_name: 'Nu', last_four: '1234',
    limit_in_cents: 500000, billing_day: 5, due_day: 12, color: '#111', is_active: 1,
  };
  it('mapeia limite em centavos e is_active → boolean', () => {
    const c = mapCreditCard(row);
    expect(c.limitInCents).toBe(500000);
    expect(c.isActive).toBe(true);
    expect(mapCreditCard({ ...row, is_active: 0 }).isActive).toBe(false);
  });
});

describe('mapInvoice', () => {
  const row: DbInvoice = {
    id: 'inv-1', credit_card_id: 'cc-1', month: '2026-05', total_in_cents: 98765,
    status: 'open', due_date: '2026-06-12', paid_at: null, created_at: '2026-05-01T00:00:00Z',
  };
  it('preserva total em centavos e mapeia campos', () => {
    const i = mapInvoice(row);
    expect(i.totalInCents).toBe(98765);
    expect(i.creditCardId).toBe('cc-1');
    expect(i.month).toBe('2026-05');
  });
});

describe('mapRecurrence', () => {
  const row: DbRecurrence = {
    id: 'rec-1', description: 'Aluguel', amount_in_cents: 250000, type: 'DES',
    category: 'Moradia', account_id: 'acc-1', credit_card_id: null,
    frequency: 'monthly', day_of_month: 10, start_date: '2026-01-10',
    end_date: null, last_generated_date: null, is_active: 1, created_at: '2026-01-01T00:00:00Z',
  };
  it('mapeia valor em centavos e is_active → boolean', () => {
    const r = mapRecurrence(row);
    expect(r.amountInCents).toBe(250000);
    expect(r.isActive).toBe(true);
    expect(r.dayOfMonth).toBe(10);
  });
});
