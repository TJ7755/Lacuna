import { expect, it } from 'vitest';
import { createClassSessions, type ClassSession } from './classSessions';

const session = (shareId: string): ClassSession => ({
  connection: {
    shareId,
    relayUrl: 'https://relay.getlacuna.app',
    courseName: 'Biology',
    writeToken: 'token',
  },
  owner: {
    privateKey: {} as CryptoKey,
    recipient: { keyId: 'key', publicKey: 'public' },
    recovery: {
      v: 1,
      recipient: { keyId: 'key', publicKey: 'public' },
      iterations: 600000,
      salt: 'salt',
      n: 'nonce',
      c: 'ciphertext',
    },
  },
  days: new Map([['2026-10-19', { reports: [], unreadable: 0 }]]),
});

it('retains tab-local class reports until that class is locked', () => {
  const cache = createClassSessions();
  const biology = session('biology');
  expect(cache.beginUnlock('biology')(biology)).toBe(true);
  expect(cache.beginUnlock('chemistry')(session('chemistry'))).toBe(true);
  expect(cache.sessions.get('biology')).toBe(biology);
  cache.lock('biology');
  expect(cache.sessions.has('biology')).toBe(false);
  expect(cache.sessions.has('chemistry')).toBe(true);
});

it('rejects a pending unlock after lock or removal and permits a fresh explicit unlock', () => {
  const cache = createClassSessions();
  const finish = cache.beginUnlock('biology');
  cache.lock('biology');
  expect(finish(session('biology'))).toBe(false);
  expect(cache.sessions.size).toBe(0);
  expect(cache.beginUnlock('biology')(session('biology'))).toBe(true);
});

it('clears every session and fences outstanding unlocks when the workspace closes', () => {
  const cache = createClassSessions();
  const finish = cache.beginUnlock('biology');
  cache.beginUnlock('chemistry')(session('chemistry'));
  cache.clear();
  expect(cache.sessions.size).toBe(0);
  expect(finish(session('biology'))).toBe(false);
  expect(cache.beginUnlock('biology')(session('biology'))).toBe(true);
});

it('does not retain credentials for a different class', () => {
  const cache = createClassSessions();
  expect(cache.beginUnlock('biology')(session('chemistry'))).toBe(false);
  expect(cache.sessions.size).toBe(0);
});
