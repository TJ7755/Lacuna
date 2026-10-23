import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { db } from '../db/schema';
import { createCard, createCourse, recordReview } from '../db/repository';
import { exportDatabase, importBackup } from '../db/portability';
import { encodeSnapshot, decodeSnapshot } from '../sync/snapshot';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { createJevEngine, JEV_SETTINGS_STORAGE_KEY } from './engine';
import { HOSTED_ACCESS_STORAGE_KEY } from '../ai/session/hostedTransport';
it('exports mark evidence but excludes device consent and credentials from backup and sync', async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.setItem(HOSTED_ACCESS_STORAGE_KEY, 'private-access-code-sentinel');
  localStorage.setItem('lacuna.answerInput', 'reveal');
  const engine = createJevEngine();
  engine.enable(1);
  expect(localStorage.getItem(JEV_SETTINGS_STORAGE_KEY)).toContain('acceptedConsentVersion');
  const course = await createCourse('Review evidence');
  const card = await createCard(course.id, 'front_back', 'Q', 'A');
  const markedBy = {
    by: 'jev' as const,
    model: 'jev-1.14.0',
    confidence: 0.97,
    markedAt: Date.now(),
  };
  await recordReview({
    card,
    deck: course,
    eventId: 'jev-review',
    sessionId: 'session',
    sessionKind: 'deck',
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    correct: true,
    markedBy,
    input: 'typed',
  });
  const backup = await exportDatabase();
  expect(backup.reviewHistory?.[0].markedBy).toEqual(markedBy);
  expect(backup.reviewHistory?.[0].input).toBe('typed');
  const encoded = await encodeSnapshot(backup);
  const decoded = await decodeSnapshot(encoded.payload);
  const merged = mergeSnapshots(backup, decoded);
  await importBackup(merged, 'replace');
  expect((await exportDatabase()).reviewHistory?.[0].markedBy).toEqual(markedBy);
  await importBackup(backup, 'merge');
  expect((await exportDatabase()).reviewHistory?.[0].markedBy).toEqual(markedBy);
  expect((await exportDatabase()).reviewHistory?.[0].input).toBe('typed');
  const serialised = JSON.stringify(merged);
  for (const excluded of [
    'private-access-code-sentinel',
    'lacuna.answerInput',
    JEV_SETTINGS_STORAGE_KEY,
    'acceptedConsentVersion',
    HOSTED_ACCESS_STORAGE_KEY,
  ])
    expect(serialised).not.toContain(excluded);
  localStorage.clear();
});
