import { vi } from 'vitest';
import type { RelayClient } from '../relayClient';
import type { JsonValue } from '../protocol';
import type { RelayEnvelope } from '../relayProtocol';
import {
  createRelayAiSession,
  type RelaySessionCrypto,
  type RelaySessionStorage,
  type RelaySessionTimers,
} from './relay';

export const CREATED = {
  sessionId: 'A'.repeat(20),
  pairingCode: 'AAAA-AAAA-AAAA-AAAA-AAAA',
  browserToken: 'ab'.repeat(32),
  expiresAt: 60_000,
};

export const BROWSER_PUBLIC_KEY =
  'BE-aWlz8OjYFeaWS8hbZ1l3uXFPxVARauwIkOe1qzHLEnpm1-pt30FCR4k3H5O4bSnOZfg-9ikxpKyDsgU-JOvc';
export const BROWSER_PRIVATE_KEY =
  'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgUgOaX_t7p24DbDzab6ZUutaIuZQny6LyFAMdUl7EoS-hRANCAARPmlpc_Do2BXmlkvIW2dZd7lxT8VQEWrsCJDntasxyxJ6Ztfqbd9BQkeJNx-TuG0pzmX4PvYpMaSsg7IFPiTr3';
export const TERMINAL_PUBLIC_KEY = BROWSER_PUBLIC_KEY;

export function relaySessionHarness() {
  let poll: (() => Promise<void>) | null = null;
  let currentTime = 1_000;
  const cancelPolling = vi.fn();
  const relay: RelayClient = {
    create: vi.fn().mockResolvedValue(CREATED),
    peer: vi.fn().mockResolvedValue(null),
    pull: vi.fn().mockResolvedValue(null),
    push: vi.fn().mockResolvedValue({ generation: '"browser-1"' }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const values = new Map<string, string>();
  const storage: RelaySessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const encryptionKey = {} as CryptoKey;
  const crypto: RelaySessionCrypto = {
    createKeyPair: vi
      .fn()
      .mockResolvedValue({ publicKey: BROWSER_PUBLIC_KEY, privateKey: BROWSER_PRIVATE_KEY }),
    deriveKey: vi.fn().mockResolvedValue(encryptionKey),
    seal: vi.fn().mockImplementation(async (_key: CryptoKey, value: JsonValue) => envelope(value)),
    open: vi.fn(),
  };
  const timers: RelaySessionTimers = {
    repeat: vi.fn((task) => {
      poll = task;
      return cancelPolling;
    }),
  };
  let nextId = 0;
  const session = createRelayAiSession({
    relay,
    storage,
    crypto,
    timers,
    now: () => currentTime,
    createId: (prefix) => `${prefix}-${++nextId}`,
  });
  session.activate();
  return {
    session,
    relay,
    storage,
    crypto,
    timers,
    cancelPolling,
    setNow: (value: number) => {
      currentTime = value;
    },
    tick: async () => {
      if (!poll) throw new Error('Polling was not scheduled.');
      await poll();
    },
  };
}

export async function runScheduled(
  task: (() => Promise<void>) | null,
  missingMessage: string,
): Promise<void> {
  if (!task) throw new Error(missingMessage);
  await task();
}

function envelope(value: JsonValue): RelayEnvelope {
  return {
    version: 1,
    nonce: btoa('nonce-12byte').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''),
    ciphertext: btoa(JSON.stringify(value).padEnd(16, '.'))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, ''),
  };
}
