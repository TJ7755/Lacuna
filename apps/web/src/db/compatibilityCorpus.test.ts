import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup, readBackupFile } from './portability';
import { recordReview } from './repository';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { waitForSessionHistory } from './portability.testFixtures';
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

function assertRelationships(backup: BackupFile, fixture: CorpusCase) {
  const expected = fixture.expected;
  expect(backup.courses).toEqual([
    expect.objectContaining({ id: expected.courseId, name: 'Synthetic biology' }),
  ]);
  expect(backup.lessons).toEqual([
    expect.objectContaining({ id: expected.lessonId, courseId: expected.courseId, name: 'Cells' }),
  ]);
  expect(backup.notes).toEqual([
    expect.objectContaining({
      lessonId: expected.lessonId,
      content: 'Synthetic teaching content.',
    }),
  ]);
  expect(backup.lessonCards).toEqual([
    expect.objectContaining({ lessonId: expected.lessonId, cardId: expected.cardId }),
  ]);
  expect(backup.cards).toEqual([
    expect.objectContaining({
      id: expected.cardId,
      courseId: expected.courseId,
      primaryLessonId: expected.lessonId,
      schedulingUnitId: expected.schedulingUnitId,
      back: 'Nucleus',
      history: [],
    }),
  ]);
  expect(backup.concepts).toContainEqual(
    expect.objectContaining({
      id: backup.cards[0].conceptId,
      scope: 'course',
      courseId: expected.courseId,
    }),
  );
  expect(backup.courseAssessments).toEqual([
    expect.objectContaining({ id: 'corpus-final', courseId: expected.courseId, kind: 'final' }),
  ]);
  expect(backup.schedulingUnits).toContainEqual(
    expect.objectContaining({
      id: expected.schedulingUnitId,
      kind: 'lesson',
      courseId: expected.courseId,
      lessonId: expected.lessonId,
    }),
  );
  expect(backup.reviewHistory).toContainEqual(
    expect.objectContaining({
      ...expected.historicalReview,
      cardId: expected.cardId,
      schedulingUnitId: expected.schedulingUnitId,
    }),
  );
  expect(backup.assets).toHaveLength(1);
  const asset = backup.assets[0];
  expect(asset).toMatchObject({
    hash: expected.assetHash,
    mimeType: 'image/png',
    width: 1,
    height: 1,
  });
  expect(createHash('sha256').update(Buffer.from(asset.data, 'base64')).digest('hex')).toBe(
    expected.assetHash,
  );
  expect(backup.cards[0].front).toBe(`Cell ![diagram](lacuna-asset://${expected.assetHash})`);
}

it.each(['backup-v10'])(
  '%s continues review and retains canonical evidence through export and restore',
  async (name) => {
    const fixture = loadCase(name);
    if (fixture.backup) {
      await db.open();
      const backup = await readBackupFile(
        new File([JSON.stringify(fixture.backup)], `${name}.json`),
      );
      await importBackup(backup, 'replace');
    } else {
      await seedProfile(fixture);
    }

    const migrated = await exportDatabase();
    assertRelationships(migrated, fixture);
    expect(migrated.reviewHistory).toHaveLength(1);
    const card = (await db.cards.get(fixture.expected.cardId))!;
    expect((await hydrateCardsWithHistory([card]))[0].history).toEqual([
      fixture.expected.historicalReview,
    ]);
    const unit = (await db.schedulingUnits.get(fixture.expected.schedulingUnitId))!;
    const eventId = `continued-${name}`;
    const review = await recordReview({
      card,
      deck: unit,
      eventId,
      sessionId: `session-${name}`,
      sessionKind: 'lesson',
      grade: 3,
      responseTimeSec: 3,
      distracted: false,
      correct: true,
      now: 1700172800000,
    });
    expect(review.recorded).toBe(true);
    expect(review.card.reps).toBe(2);
    await waitForSessionHistory(eventId);

    const exported = JSON.parse(JSON.stringify(await exportDatabase())) as BackupFile;
    await readBackupFile(new File([JSON.stringify(exported)], 'exported.json'));
    assertRelationships(exported, fixture);
    expect(exported.reviewHistory).toHaveLength(2);
    expect(exported.reviewHistory).toContainEqual(
      expect.objectContaining({ eventId, cardId: card.id, sessionKind: 'lesson', grade: 3 }),
    );

    await db.delete();
    await db.open();
    await importBackup(exported, 'replace');
    db.close();
    await db.open();
    const restored = JSON.parse(JSON.stringify(await exportDatabase())) as BackupFile;
    assertRelationships(restored, fixture);
    expect(restored.cards).toEqual(exported.cards);
    expect(restored.reviewHistory).toEqual(exported.reviewHistory);
    expect(restored.sessionHistory).toEqual(exported.sessionHistory);
    expect(restored.assets).toEqual(exported.assets);
    expect(restored.lessonCards).toEqual(exported.lessonCards);
    expect((await hydrateCardsWithHistory(await db.cards.toArray()))[0].history).toHaveLength(2);
  },
);

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
