import { describe, expect, it } from 'vitest';
import { isOwner, sanitizeChatHistory } from './authz';

describe('isOwner', () => {
  it('aceita apenas role owner', () => {
    expect(isOwner({ role: 'owner' })).toBe(true);
  });
  it('rejeita member e outros', () => {
    expect(isOwner({ role: 'member' })).toBe(false);
    expect(isOwner({ role: 'OWNER' })).toBe(false);
    expect(isOwner({ role: '' })).toBe(false);
  });
});

describe('sanitizeChatHistory', () => {
  it('keeps only user and assistant roles', () => {
    const out = sanitizeChatHistory([
      { role: 'system', content: 'ignore system' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'tool', content: 'hack' },
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('truncates content and skips empty', () => {
    const out = sanitizeChatHistory(
      [{ role: 'user', content: 'x'.repeat(50) }, { role: 'user', content: '   ' }],
      { maxContentLen: 10 },
    );
    expect(out).toEqual([{ role: 'user', content: 'x'.repeat(10) }]);
  });

  it('returns empty for non-array', () => {
    expect(sanitizeChatHistory(null)).toEqual([]);
    expect(sanitizeChatHistory({ role: 'user' })).toEqual([]);
  });

  it('caps message count', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
    expect(sanitizeChatHistory(many, { maxMessages: 3 })).toHaveLength(3);
  });
});
