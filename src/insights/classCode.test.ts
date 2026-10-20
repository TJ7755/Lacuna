import { expect, it } from 'vitest';
import {
  formatClassCode,
  parseClassCode,
  normaliseShortClassCode,
  formatShortClassCode,
} from './classCode';

it('binds the class code and pasted invitation link to the complete teacher fingerprint', () => {
  const invitation = { shareId: 'ab'.repeat(16), keyId: 'cd'.repeat(32) };
  const code = formatClassCode(invitation);
  expect(code).toMatch(/^GAPS1_[A-Za-z0-9_-]{64}$/);
  expect(parseClassCode(code)).toEqual(invitation);
  expect(parseClassCode(`https://getlacuna.app/#/s/${code}`)).toEqual(invitation);
  for (const invalid of [
    invitation.shareId,
    `${code}=`,
    code.slice(0, -1),
    code.replace('GAPS1', 'GAPS2'),
  ])
    expect(() => parseClassCode(invalid)).toThrow();
});

it('normalises short codes without accepting characters outside Crockford base32', () => {
  for (const value of ['k7qm4xtp', 'K7QM-4XTP', ' k7 qm 4x tp '])
    expect(normaliseShortClassCode(value)).toBe('K7QM4XTP');
  expect(normaliseShortClassCode('oilL-abcd')).toBe('0111ABCD');
  for (const value of ['', '1234567', '123456789', '1234U678', '1234_678'])
    expect(normaliseShortClassCode(value)).toBeNull();
  expect(formatShortClassCode('K7QM4XTP')).toBe('K7QM-4XTP');
});
