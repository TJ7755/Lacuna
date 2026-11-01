import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  createJevSession,
  jevInstallationId,
  loadJevMaintainerIds,
  loadJevSigningKey,
  verifyJevSession,
} from './access';

it('binds expiring Jev sessions to an opaque installation identity and purpose', () => {
  const key = 'k'.repeat(32);
  const id = jevInstallationId('a'.repeat(64))!;
  const session = createJevSession(id, key, 1000);
  expect(id).toMatch(/^[a-f0-9]{64}$/);
  expect(id).not.toBe('a'.repeat(64));
  expect(verifyJevSession(session.token, key, 1000)).toBe(id);
  expect(verifyJevSession(session.token, key, session.expiresAt)).toBeNull();
  expect(verifyJevSession(`${session.token}x`, key, 1000)).toBeNull();
  expect(
    verifyJevSession(`${session.token.split('.')[0]}.${'é'.repeat(43)}`, key, 1000),
  ).toBeNull();
  const payload = Buffer.from(JSON.stringify({ id, exp: 3601 })).toString('base64url');
  const legacy = `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
  expect(verifyJevSession(legacy, key, 1000)).toBeNull();
});

it('rejects malformed credentials, signing keys and maintainer lists', () => {
  for (const invalid of [null, '', 'a'.repeat(63), 'A'.repeat(64), 'x'.repeat(64)])
    expect(jevInstallationId(invalid)).toBeNull();
  expect(loadJevSigningKey({})).toBeNull();
  expect(loadJevSigningKey({ AI_SESSION_SIGNING_KEY: 'short' })).toBeNull();
  expect(loadJevMaintainerIds(undefined)).toEqual(new Set());
  expect(loadJevMaintainerIds(JSON.stringify(['a'.repeat(64)]))).toEqual(new Set(['a'.repeat(64)]));
  for (const invalid of ['{}', '["invalid"]', 'null', '{'])
    expect(loadJevMaintainerIds(invalid)).toBeNull();
});
