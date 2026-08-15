import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bytesToBase45 } from './base45';
import { ensureLessonBackingDeck } from './backingDecks';
import { exportDatabase, importBackup, PRE_V22_BACKUP_MESSAGE } from './portability';
import { reviewHistoryEntriesForCard } from './reviewHistory';
import { createCard, createCourse, createLesson } from './repository';
import { db } from './schema';
import {
  decodeShareDirect,
  encodeShareDirect,
  encodeShareQRDirect,
  importSharePayload,
  V1_SHARE_CODE_MESSAGE,
  type SharePayloadV1,
} from './share';
import type { ReviewLog } from './types';

async function resetDatabase(): Promise<void> {
  await Promise.all(db.tables.map((table) => table.clear()));
}

const reviews: ReviewLog[] = [
  {
    eventId: 'event-first',
    sessionId: 'session-1',
    sessionKind: 'lesson',
    timestamp: 1_700_000_000_000,
    grade: 3,
    responseTimeSec: 5,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 2.5,
    difficultyBefore: null,
    difficultyAfter: 5.2,
    retrievabilityAtReview: null,
  },
  {
    eventId: 'event-second',
    sessionId: 'session-1',
    sessionKind: 'lesson',
    timestamp: 1_700_086_400_000,
    grade: 2,
    responseTimeSec: 7,
    distracted: true,
    stabilityBefore: 2.5,
    stabilityAfter: 3.1,
    difficultyBefore: 5.2,
    difficultyAfter: 5.5,
    retrievabilityAtReview: 0.81,
  },
];

describe('legacy storage compatibility net', () => {
  beforeEach(resetDatabase);

  it('refuses a Deck-bearing backup instead of converting it', async () => {
    await expect(
      importBackup(
        {
          app: 'lacuna',
          version: 9,
          exportedAt: 1,
          decks: [{ id: 'old-deck' }],
          cards: [],
          assets: [],
          sessionHistory: [],
          userPerformance: [],
        } as never,
        'replace',
      ),
    ).rejects.toThrow(PRE_V22_BACKUP_MESSAGE);
  });

  it('round-trips a current Course backup without changing review identity, order or performance', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    const card = await createCard(deckId, 'front_back', 'What is a cell?', 'The basic unit of life.', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });
    const reviewedCard = {
      ...card,
      history: reviews,
      reps: reviews.length,
      lastReviewed: reviews[1].timestamp,
    };
    await db.cards.put(reviewedCard);
    await db.reviewHistory.bulkPut(reviewHistoryEntriesForCard(reviewedCard));
    await db.coursePerformance.put({
      courseId: course.id,
      runningMeanResponseTime: 6,
      runningStdDevResponseTime: 1,
      m2: 2,
      totalCorrectReviews: 2,
      updatedAt: 0,
    });
    await db.schedulingPerformance.put({
      schedulingUnitId: lesson.id,
      courseId: course.id,
      lessonId: lesson.id,
      runningMeanResponseTime: 6,
      runningStdDevResponseTime: 1,
      m2: 2,
      totalCorrectReviews: 2,
      updatedAt: 0,
    });

    const backup = await exportDatabase();
    const expectedEvents = backup.reviewHistory!.filter((event) => event.cardId === card.id);
    const expectedCoursePerformance = backup.coursePerformance;
    const expectedSchedulingPerformance = backup.schedulingPerformance;

    await resetDatabase();
    await importBackup(backup, 'replace');

    expect((await db.cards.get(card.id))?.history).toEqual(reviews);
    expect(await db.reviewHistory.where('cardId').equals(card.id).sortBy('timestamp')).toEqual(
      expectedEvents,
    );
    expect(await db.coursePerformance.toArray()).toEqual(expectedCoursePerformance);
    expect(await db.schedulingPerformance.toArray()).toEqual(expectedSchedulingPerformance);
  });

  it.each(['LAC0', 'LAC1', 'LAC2', 'LAC3'] as const)(
    'refuses a %s v1 deck share code',
    async (prefix) => {
      const payload: SharePayloadV1 = {
        v: 1,
        by: null,
        at: 1_700_000_000_000,
        decks: [
          {
            n: `${prefix} chemistry`,
            o: 0,
            c: 0,
            e: 0,
            cards: [{ k: 0, f: 'Water formula', b: 'H2O' }],
          },
        ],
      };
      const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
      const code =
        prefix === 'LAC0'
          ? `LAC0${btoa(String.fromCharCode(...jsonBytes))}`
          : prefix === 'LAC3'
            ? `LAC3${bytesToBase45(jsonBytes)}`
            : prefix === 'LAC1'
              ? await encodeShareDirect(payload)
              : await encodeShareQRDirect(payload);
      expect(code.startsWith(prefix)).toBe(true);

      await expect(decodeShareDirect(code)).rejects.toThrow(V1_SHARE_CODE_MESSAGE);
      await expect(importSharePayload(payload)).rejects.toThrow(V1_SHARE_CODE_MESSAGE);
    },
  );

  it('round-trips a target-storage export unchanged', async () => {
    const course = await createCourse('Physics');
    const lesson = await createLesson(course.id, 'Forces');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    await createCard(deckId, 'front_back', 'Force unit', 'Newton', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });
    const first = await exportDatabase();

    await resetDatabase();
    await importBackup(first, 'replace');
    const second = await exportDatabase();

    expect({ ...second, exportedAt: first.exportedAt }).toEqual(first);
  });
});
