import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncState } from '../db/types';
import {
  DEFAULT_RELAY_URL,
  MIN_RECOVERY_PASSPHRASE_LENGTH,
  SyncPairingError,
  decodePairingCode,
  encodePairingCode,
  setupFirstDevice,
  validateRecoveryPassphrase,
  type SyncCredentials,
} from './pairing';
import type { SyncResult } from './cycle';

const { readSyncStateMock, writeSyncStateMock, syncCycleMock } = vi.hoisted(() => ({
  readSyncStateMock: vi.fn(),
  writeSyncStateMock: vi.fn(),
  syncCycleMock: vi.fn(),
}));

vi.mock('../db/mutationStamp', () => ({
  readSyncState: readSyncStateMock,
  writeSyncState: writeSyncStateMock,
  clearSyncState: vi.fn(),
}));

vi.mock('./cycle', () => ({ syncCycle: syncCycleMock }));

const CHANNEL_ID = '0123456789abcdef0123456789abcdef';
const WRITE_TOKEN = 'ab'.repeat(32);
const CHANNEL_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const PASSPHRASE = 'correct horse battery staple';

const syncResult = {
  attempts: 1,
  pulled: false,
  pushed: true,
  snapshotBytes: 200,
  snapshotPlaintextBytes: 180,
  generation: '"state-1"',
  mergeSummary: null,
  size: {
    plaintextBytes: 180,
    transportBytes: 200,
    limitBytes: 4_500_000,
    courseNames: [],
  },
} as SyncResult;

function credentials(): SyncCredentials {
  return {
    relayUrl: DEFAULT_RELAY_URL,
    channelId: CHANNEL_ID,
    channelKey: CHANNEL_KEY,
    writeToken: WRITE_TOKEN,
  };
}

function response(status: number, body?: unknown, headers?: HeadersInit): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  readSyncStateMock.mockReset();
  writeSyncStateMock.mockReset().mockResolvedValue(undefined);
  syncCycleMock.mockReset().mockResolvedValue(syncResult);
  readSyncStateMock.mockImplementation(async () => {
    const latest = writeSyncStateMock.mock.lastCall?.[0] as SyncState | undefined;
    return latest;
  });
});

describe('validateRecoveryPassphrase', () => {
  it('rejects empty, whitespace-only and short passphrases', () => {
    expect(validateRecoveryPassphrase('')).toBe('Enter a recovery passphrase.');
    expect(validateRecoveryPassphrase(' '.repeat(MIN_RECOVERY_PASSPHRASE_LENGTH))).toBe(
      'Enter a recovery passphrase.',
    );
    expect(validateRecoveryPassphrase('short')).toContain(
      `${MIN_RECOVERY_PASSPHRASE_LENGTH} characters`,
    );
  });

  it('accepts a memorable passphrase at the policy boundary', () => {
    expect(validateRecoveryPassphrase('a'.repeat(MIN_RECOVERY_PASSPHRASE_LENGTH))).toBeNull();
  });
});

describe('pairing QR payloads', () => {
  it('round-trips the relay capability without including the mint secret', () => {
    const code = encodePairingCode(credentials());
    expect(code).toContain('LACUNA-SYNC-1:');
    expect(code).not.toContain('mint-secret');
    expect(decodePairingCode(code)).toEqual({
      version: 1,
      relayUrl: DEFAULT_RELAY_URL,
      channelId: CHANNEL_ID,
      writeToken: WRITE_TOKEN,
      channelKeyHex: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
    });
  });

  it('rejects malformed or non-Lacuna QR values before any network call', () => {
    expect(() => decodePairingCode('https://example.test')).toThrow(SyncPairingError);
    expect(() => decodePairingCode('LACUNA-SYNC-1:not-valid')).toThrow('unreadable');
  });
});

describe('setupFirstDevice', () => {
  it('mints a channel and publishes only the encrypted keybag before the first sync', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(201, { channelId: CHANNEL_ID, writeToken: WRITE_TOKEN }))
      .mockResolvedValueOnce(response(204, undefined, { ETag: '"keybag-1"' }));

    const session = await setupFirstDevice(DEFAULT_RELAY_URL, 'mint-secret-for-tests', PASSPHRASE, {
      fetchImpl,
      now: () => 1_700_000_000_000,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]).toEqual([
      `${DEFAULT_RELAY_URL}/channel`,
      { method: 'POST', headers: { Authorization: 'Bearer mint-secret-for-tests' } },
    ]);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(`${DEFAULT_RELAY_URL}/c/${CHANNEL_ID}/keybag`);
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: `Bearer ${WRITE_TOKEN}`,
        'If-Match': '"0"',
      }),
    });
    expect(writeSyncStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        relayUrl: DEFAULT_RELAY_URL,
        channelId: CHANNEL_ID,
        wrappedKeyMaterial: expect.stringMatching(/^[0-9a-f]+$/),
        lastError: null,
      }),
    );
    expect(syncCycleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: CHANNEL_ID,
        channelKey: expect.any(Uint8Array),
        provider: expect.anything(),
        now: expect.any(Function),
      }),
    );
    expect(session.result).toBe(syncResult);
    expect(session.state.channelId).toBe(CHANNEL_ID);
    expect(decodePairingCode(session.pairingCode).channelId).toBe(CHANNEL_ID);
  }, 30_000);
});
