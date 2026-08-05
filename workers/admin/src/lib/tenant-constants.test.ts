import { describe, expect, it } from 'vitest';
import { isReservedSubdomain, isTenantStatus } from './tenant-constants';

describe('isReservedSubdomain', () => {
  it('bloqueia subdomínios reservados', () => {
    expect(isReservedSubdomain('admin')).toBe(true);
    expect(isReservedSubdomain('API')).toBe(true);
    expect(isReservedSubdomain('www')).toBe(true);
  });
  it('permite nomes de família', () => {
    expect(isReservedSubdomain('silva')).toBe(false);
    expect(isReservedSubdomain('dahora')).toBe(false);
  });
});

describe('isTenantStatus', () => {
  it('aceita enum válido', () => {
    expect(isTenantStatus('pending')).toBe(true);
    expect(isTenantStatus('active')).toBe(true);
    expect(isTenantStatus('suspended')).toBe(true);
    expect(isTenantStatus('deleted')).toBe(true);
  });
  it('rejeita inválidos', () => {
    expect(isTenantStatus('ok')).toBe(false);
    expect(isTenantStatus(null)).toBe(false);
  });
});
