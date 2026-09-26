import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { readSyncState } from '../db/mutationStamp';
import {
  forgetShareCredentials,
  readShareCredentials,
  writeShareCredentials,
} from './credentials';

const SHARE_ID = 'c'.repeat(32);
const RELAY_URL = 'https://relay.example';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('share link credentials', () => {
  it('round-trips write credentials for a share', async () => {
    expect(await readShareCredentials(SHARE_ID)).toBeNull();
    await writeShareCredentials(SHARE_ID, {
      relayUrl: RELAY_URL,
      writeToken: 'd'.repeat(64),
      payloadGeneration: '"t1"',
    });
    expect(await readShareCredentials(SHARE_ID)).toEqual({
      relayUrl: RELAY_URL,
      writeToken: 'd'.repeat(64),
      payloadGeneration: '"t1"',
    });
  });

  it('refuses invalid share ids and write tokens', async () => {
    expect(await readShareCredentials('short')).toBeNull();
    await expect(writeShareCredentials('short', { relayUrl: RELAY_URL, writeToken: 'd'.repeat(64) }))
      .rejects.toThrow('share link code is invalid');
    await expect(
      writeShareCredentials(SHARE_ID, { relayUrl: RELAY_URL, writeToken: 'short' }),
    ).rejects.toThrow('write token is invalid');
  });

  it('forgets credentials without touching the rest of sync state', async () => {
    await writeShareCredentials(SHARE_ID, { relayUrl: RELAY_URL, writeToken: 'd'.repeat(64) });
    await writeShareCredentials('e'.repeat(32), { relayUrl: RELAY_URL, writeToken: 'f'.repeat(64) });
    await forgetShareCredentials(SHARE_ID);
    expect(await readShareCredentials(SHARE_ID)).toBeNull();
    expect(await readShareCredentials('e'.repeat(32))).not.toBeNull();
    expect((await readSyncState())?.shareLinks?.[SHARE_ID]).toBeUndefined();
  });
});
