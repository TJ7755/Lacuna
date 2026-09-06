import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetBackupThrottleForTests } from '../db/backups';
import { createCourseCard } from '../db/cardRepository';
import { createCourse } from '../db/courseRepository';
import { exportDatabase, importBackup } from '../db/portability';
import { recordReview } from '../db/reviewRepository';
import { db } from '../db/schema';
import type { BackupFile, Card, Course } from '../db/types';
import { manualMerge } from './manualMerge';
import { mergeSnapshots } from './mergeSnapshots';

const SCHEDULE_FIELDS = [
  'stability',
  'difficulty',
  'lastReviewed',
  'reps',
  'lapses',
  'state',
  'due',
  'scheduledDays',
  'learningSteps',
] as const satisfies readonly (keyof Card)[];

async function recordBranchReview(
  course: Course,
  card: Card,
  eventId: string,
  now: number,
): Promise<BackupFile> {
  await recordReview({
    card,
    eventId,
    sessionId: `session-${eventId}`,
    sessionKind: 'deck',
    deck: course,
    kind: 'course',
    grade: 3,
    responseTimeSec: 2,
    distracted: false,
    correct: true,
    now,
  });
  return exportDatabase();
}

function scheduleOf(card: Card): Pick<Card, (typeof SCHEDULE_FIELDS)[number]> {
  return Object.fromEntries(SCHEDULE_FIELDS.map((field) => [field, card[field]])) as Pick<
    Card,
    (typeof SCHEDULE_FIELDS)[number]
  >;
}

describe('manualMerge review convergence', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    __resetBackupThrottleForTests();
  });

  it('replays two independent reviews and persists their converged schedule after reopen', async () => {
    const course = await createCourse('Convergence');
    const card = await createCourseCard(course.id, 'front_back', 'Question', 'Answer');
    const base = await exportDatabase();

    const local = await recordBranchReview(course, card, 'event-local', 1_800_000_000_000);

    await importBackup(base, 'replace');
    const remoteCourse = (await db.courses.get(course.id))!;
    const remoteCard = (await db.cards.get(card.id))!;
    const remote = await recordBranchReview(
      remoteCourse,
      remoteCard,
      'event-remote',
      1_800_000_001_000,
    );

    const expected = mergeSnapshots(local, remote);
    const expectedCard = expected.cards.find((candidate) => candidate.id === card.id)!;

    await importBackup(local, 'replace');
    __resetBackupThrottleForTests();
    await manualMerge(remote);

    db.close();
    await db.open();
    const persisted = await exportDatabase();
    const persistedCard = persisted.cards.find((candidate) => candidate.id === card.id)!;
    const events = persisted.reviewHistory!
      .filter((entry) => entry.cardId === card.id)
      .sort((left, right) => left.timestamp - right.timestamp);

    expect(events.map((entry) => entry.eventId)).toEqual(['event-local', 'event-remote']);
    expect(persistedCard.history).toEqual([]);
    expect(scheduleOf(persistedCard)).toEqual(scheduleOf(expectedCard));
    expect(persistedCard.reps).toBe(2);
  });
});
