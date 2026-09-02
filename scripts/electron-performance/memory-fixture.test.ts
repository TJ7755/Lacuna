import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { importBackup, validateBackup } from '../../src/db/portability';
import { db } from '../../src/db/schema';
import { createLargeMemoryFixture, fingerprintMemoryFixture } from './memory-fixture';

describe('large Electron memory fixture', () => {
  afterEach(async () => {
    if (db.isOpen()) await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('is deterministic, current and accepted by the real backup validator', () => {
    const first = createLargeMemoryFixture();
    const second = createLargeMemoryFixture();

    expect(validateBackup(first)).toBe(true);
    expect(first).toEqual(second);
    expect(first.courses).toHaveLength(1);
    expect(first.lessons).toHaveLength(100);
    expect(first.cards).toHaveLength(10_000);
    expect(first.assets).toEqual([]);
    expect(first.reviewHistory).toEqual([]);
    expect(first.sessionHistory).toEqual([]);
    expect(fingerprintMemoryFixture(first)).toBe(
      createHash('sha256').update(JSON.stringify(first)).digest('hex'),
    );
  });

  it('replace-imports through the real recovery path with the advertised counts', async () => {
    await importBackup(createLargeMemoryFixture(), 'replace');

    expect(await db.courses.count()).toBe(1);
    expect(await db.lessons.count()).toBe(100);
    expect(await db.cards.count()).toBe(10_000);
    expect(await db.assets.count()).toBe(0);
    expect(await db.reviewHistory.count()).toBe(0);
  }, 15_000);
});
