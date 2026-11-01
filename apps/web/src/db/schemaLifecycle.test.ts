import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, openDatabase } from './schema';

describe('database opening', () => {
  beforeEach(async () => {
    await db.delete();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it('opens successfully and schedules pruning without removing fresh tombstones', async () => {
    await db.open();
    const fresh = { table: 'cards', recordId: 'fresh', deletedAt: Date.now() };
    await db.tombstones.bulkPut([{ table: 'cards', recordId: 'expired', deletedAt: 0 }, fresh]);
    db.close();

    await expect(openDatabase()).resolves.toEqual({ ok: true });
    await vi.waitFor(async () => {
      expect(await db.tombstones.get(['cards', 'expired'])).toBeUndefined();
    });
    expect(await db.tombstones.get(['cards', 'fresh'])).toEqual(fresh);
  });

  it('keeps the database usable when deferred pruning fails', async () => {
    const where = vi.spyOn(db.tombstones, 'where').mockImplementationOnce(() => {
      throw new Error('Pruning unavailable');
    });

    await expect(openDatabase()).resolves.toEqual({ ok: true });
    await vi.waitFor(() => expect(where).toHaveBeenCalledWith('deletedAt'));
    expect(db.isOpen()).toBe(true);
  });

  it.each([
    {
      error: new DOMException('full', 'QuotaExceededError'),
      reason: 'quota',
      message: 'storage is full',
    },
    {
      error: new DOMException('newer', 'VersionError'),
      reason: 'corrupt',
      message: 'newer version',
    },
    {
      error: new DOMException('aborted', 'AbortError'),
      reason: 'corrupt',
      message: 'could not be opened',
    },
    {
      error: new Error('Database is blocked'),
      reason: 'blocked',
      message: 'another tab or window',
    },
    {
      error: new Error('disk unavailable'),
      reason: 'unknown',
      message: 'Failed to open the local database: disk unavailable',
    },
    {
      error: 'storage unavailable',
      reason: 'unknown',
      message: 'Failed to open the local database: storage unavailable',
    },
  ])('reports $reason for $message', async ({ error, reason, message }) => {
    vi.spyOn(db, 'open').mockRejectedValueOnce(error);

    await expect(openDatabase()).resolves.toEqual({
      ok: false,
      reason,
      message: expect.stringContaining(message),
    });
  });
});
