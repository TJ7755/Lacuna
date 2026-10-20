import { expect, it } from 'vitest';
import { formatRecoveryCode, generateRecoveryCode, normaliseRecoveryCode } from './recoveryCode';

it('generates 24 Crockford characters and formats six groups', () => {
  const codes = Array.from({ length: 100 }, generateRecoveryCode);
  for (const code of codes) {
    expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{24}$/);
    expect(formatRecoveryCode(code)).toMatch(/^(?:[0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
  }
  expect(new Set(codes).size).toBe(100);
});
it('normalises case, separators and ambiguous characters', () => {
  expect(normaliseRecoveryCode('oill-2345 6789-abcd efgh-jkmn')).toBe('011123456789ABCDEFGHJKMN');
  expect(normaliseRecoveryCode('oill-2345 6789-abcd efgh-jkmn-p')).toBeNull();
});
it.each([
  '',
  'A'.repeat(23),
  'A'.repeat(25),
  'U'.repeat(24),
  'A'.repeat(23) + '!',
  'A'.repeat(23) + '\n',
])('rejects invalid code %j', (input) => {
  expect(normaliseRecoveryCode(input)).toBeNull();
});
