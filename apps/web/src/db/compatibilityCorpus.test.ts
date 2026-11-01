import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup, readBackupFile } from './portability';
import type { BackupFile, ReviewLog } from '@lacuna/core/db/types';

interface CorpusCase {
  provenance: { kind: string; sourceCommit: string };
  indexedDbVersion?: number;
  stores?: Record<string, string>;
  rows?: Record<string, Record<string, unknown>[]>;
  backup?: unknown;
  expectedOutcome: string;
  expected: {
    cardId: string;
    courseId: string;
    lessonId: string;
    schedulingUnitId: string;
    historicalReview: ReviewLog;
    assetHash: string;
  };
}

function loadCase(name: string): CorpusCase {
  return JSON.parse(readFileSync(`tests/fixtures/compatibility/${name}.json`, 'utf8'));
}

async function cleanDatabase() {
  db.close();
  await db.delete();
  await new Dexie('lacuna-pre-migration').delete();
}
beforeEach(cleanDatabase);
afterEach(cleanDatabase);

async function seedProfile(fixture: CorpusCase) {
  const legacy = new Dexie('lacuna');
  legacy.version(fixture.indexedDbVersion!).stores(fixture.stores!);
  try {
    await legacy.open();
    for (const [table, rows] of Object.entries(fixture.rows!)) {
      const records = rows.map((row) => {
        if (table !== 'assets') return row;
        const { data, ...asset } = row;
        return { ...asset, blob: new Uint8Array(Buffer.from(data as string, 'base64')) };
      });
      await legacy.table(table).bulkAdd(records);
    }
  } finally {
    legacy.close();
  }
  db.close({ disableAutoOpen: false });
}

it('refuses backup-v10 without replacing the current database', async () => {
  await db.open();
  await db.courses.add({
    id: 'retained-course',
    name: 'Retained course',
    createdAt: 1,
    updatedAt: 1,
  } as never);
  const before = await exportDatabase();
  const fixture = loadCase('backup-v10');
  await expect(
    readBackupFile(new File([JSON.stringify(fixture.backup)], 'backup-v10.json')),
  ).rejects.toThrow(/Unsupported old backup version/);
  await expect(importBackup(fixture.backup as BackupFile, 'replace')).rejects.toThrow(
    /Unsupported old backup version/,
  );
  expect(await exportDatabase()).toEqual({ ...before, exportedAt: expect.any(Number) });
});

it.each(['profile-v20', 'profile-v25'])(
  '%s is refused without altering the historical profile',
  async (name) => {
    const fixture = loadCase(name);
    await seedProfile(fixture);
    await expect(db.open()).rejects.toThrow(/27/);
    const source = new Dexie('lacuna');
    await source.open();
    try {
      expect(source.verno).toBe(fixture.indexedDbVersion);
      for (const [table, rows] of Object.entries(fixture.rows!)) {
        expect(await source.table(table).count()).toBe(rows.length);
      }
      const card = await source.table('cards').get(fixture.expected.cardId);
      expect(card).toMatchObject(
        fixture.rows!.cards.find((row) => row.id === fixture.expected.cardId)!,
      );
    } finally {
      source.close();
    }
  },
);
