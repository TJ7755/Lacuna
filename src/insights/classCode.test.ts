import { expect, it } from 'vitest';
import { formatClassCode, parseClassCode } from './classCode';

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
