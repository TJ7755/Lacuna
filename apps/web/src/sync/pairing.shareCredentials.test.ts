import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { readSyncState } from '../db/mutationStamp';
import { readShareCredentials, writeShareCredentials } from '../shareLinks/credentials';
import { joinFromPairingCode, unpair } from './pairing';

vi.mock('./cycle', () => ({ syncCycle: vi.fn(async () => ({})) }));

// Teacher share-link write tokens share the syncState row with the sync pairing.
// Changing the pairing must not lose them, or the device can no longer republish
// or take down its published links.
const SHARE_ID = 'f'.repeat(32);
const SHARE_CREDENTIALS = { relayUrl: 'https://relay.getlacuna.app', writeToken: 'a'.repeat(64) };
const PAIRING = {
  version: 1 as const,
  relayUrl: 'https://relay.getlacuna.app',
  channelId: '0123456789abcdef0123456789abcdef',
  writeToken: 'b'.repeat(64),
  channelKeyHex: 'c'.repeat(64),
};

beforeEach(async () => {
  await db.appState.clear();
});

describe('sync pairing and share-link credentials', () => {
  it.each(['HTTPS://LACUNA-RELAY.VERCEL.APP/', 'https://lacuna-relay.vercel.app:443'])(
    'uses the migrated relay consistently when joining from a legacy QR code: %s',
    async (relayUrl) => {
      const session = await joinFromPairingCode(
        { ...PAIRING, relayUrl },
        'correct horse battery staple',
      );

      expect(session.credentials.relayUrl).toBe('https://relay.getlacuna.app');
      expect(session.state.relayUrl).toBe(session.credentials.relayUrl);
      expect(session.credentials.channelId).toBe(PAIRING.channelId);
      expect(session.credentials.writeToken).toBe(PAIRING.writeToken);
      expect(session.credentials.channelKey).toEqual(new Uint8Array(32).fill(0xcc));
    },
    30_000,
  );

  it('keeps share-link credentials when joining a sync channel', async () => {
    await writeShareCredentials(SHARE_ID, SHARE_CREDENTIALS);
    await joinFromPairingCode(PAIRING, 'correct horse battery staple');

    expect(await readShareCredentials(SHARE_ID)).toEqual(SHARE_CREDENTIALS);
    expect((await readSyncState())?.channelId).toBe(PAIRING.channelId);
  }, 30_000);

  it('keeps share-link credentials but forgets the pairing when unpairing', async () => {
    await writeShareCredentials(SHARE_ID, SHARE_CREDENTIALS);
    await joinFromPairingCode(PAIRING, 'correct horse battery staple');
    await unpair();

    expect(await readShareCredentials(SHARE_ID)).toEqual(SHARE_CREDENTIALS);
    expect(await readSyncState()).toEqual({
      shareLinks: { [SHARE_ID]: SHARE_CREDENTIALS },
    });
  }, 30_000);

  it('removes the sync state entirely when unpairing a device with no share links', async () => {
    await joinFromPairingCode(PAIRING, 'correct horse battery staple');
    await unpair();

    expect(await readSyncState()).toBeUndefined();
  }, 30_000);
});
