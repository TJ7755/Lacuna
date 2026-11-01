import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse, createCourseCard, recordReview } from './repository';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { exportDatabase, importBackup, validateBackup } from './portability';
import { PRIMING_WINDOW_MS } from '../fsrs/primedReview';
import type { Card, Course, ReviewLog } from './types';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function review(
  course: Course,
  card: Card,
  eventId: string,
  sessionId: string,
  now: number,
  input?: ReviewLog['input'],
) {
  const [current] = await hydrateCardsWithHistory([(await db.cards.get(card.id))!]);
  const result = await recordReview({
    card: current,
    eventId,
    sessionId,
    sessionKind: 'practice',
    deck: course,
    kind: 'course',
    grade: 4,
    responseTimeSec: 2,
    distracted: false,
    correct: true,
    now,
    input,
  });
  return result.card.history.at(-1);
}

it('marks an answer primed only after an earlier answer in the same session and window (#313)', async () => {
  const course = await createCourse('Biology');
  const card = await createCourseCard(course.id, 'front_back', 'Mitochondria', 'Respiration');
  const start = Date.UTC(2026, 9, 6, 9);

  expect((await review(course, card, 'e1', 's1', start))?.primed).toBeUndefined();
  expect((await review(course, card, 'e2', 's1', start + 60_000))?.primed).toBe(true);
  expect((await review(course, card, 'e3', 's2', start + 120_000))?.primed).toBeUndefined();
  expect(
    (await review(course, card, 'e4', 's2', start + 120_000 + PRIMING_WINDOW_MS))?.primed,
  ).toBeUndefined();

  const stored = await db.reviewHistory.where('cardId').equals(card.id).sortBy('timestamp');
  expect(stored.map((entry) => entry.primed ?? false)).toEqual([false, true, false, false]);
});

it('keeps the primed flag through a backup round trip and rejects a malformed one', async () => {
  const course = await createCourse('Biology');
  const card = await createCourseCard(course.id, 'front_back', 'Ribosome', 'Translation');
  const start = Date.UTC(2026, 9, 6, 9);
  await review(course, card, 'e1', 's1', start);
  await review(course, card, 'e2', 's1', start + 60_000);

  const backup = await exportDatabase();
  expect(backup.reviewHistory?.find((entry) => entry.eventId === 'e2')?.primed).toBe(true);
  expect(
    validateBackup({
      ...backup,
      reviewHistory: backup.reviewHistory?.map((entry) => ({ ...entry, primed: 'yes' })),
    }),
  ).toBe(false);

  await importBackup(backup, 'replace');
  const restored = await db.reviewHistory.where('cardId').equals(card.id).sortBy('timestamp');
  expect(restored.map((entry) => entry.primed ?? false)).toEqual([false, true]);
});

it('preserves optional input through history hydration and backup restore, and validates it', async () => {
  const course = await createCourse('Inputs');
  const card = await createCourseCard(course.id, 'front_back', 'Question', 'Answer');
  const now = Date.now();
  await review(course, card, 'legacy', 'session', now);
  await review(course, card, 'typed', 'session', now + 1000, 'typed');
  await review(course, card, 'reveal', 'session', now + 2000, 'reveal');
  const backup = await exportDatabase();
  expect(
    backup.reviewHistory
      ?.slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry) => entry.input),
  ).toEqual([undefined, 'typed', 'reveal']);
  expect(
    validateBackup({
      ...backup,
      reviewHistory: backup.reviewHistory?.map((entry) => ({ ...entry, input: 'type' })),
    }),
  ).toBe(false);
  expect(
    validateBackup({
      ...backup,
      cards: backup.cards.map((row) => ({
        ...row,
        history: [{ ...backup.reviewHistory![0], input: 'type' }],
      })),
    }),
  ).toBe(false);
  await importBackup(JSON.parse(JSON.stringify(backup)), 'replace');
  const [restored] = await hydrateCardsWithHistory([(await db.cards.get(card.id))!]);
  expect(restored.history.map((entry) => entry.input)).toEqual([undefined, 'typed', 'reveal']);
});
