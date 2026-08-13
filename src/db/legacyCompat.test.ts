import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bytesToBase45 } from './base45';
import { ensureLessonBackingDeck } from './backingDecks';
import { exportDatabase, importBackup } from './portability';
import { reviewHistoryEntriesForCard } from './reviewHistory';
import { createCard, createCourse, createDeck, createLesson } from './repository';
import { db } from './schema';
import {
  decodeShareDirect,
  encodeShareDirect,
  encodeShareQRDirect,
  importSharePayload,
  type SharePayloadV1,
} from './share';
import type { BackupFile, ReviewLog } from './types';

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

  it('round-trips a v21 Course backup without changing review identity, order or performance', async () => {
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
    });
    await db.schedulingPerformance.put({
      schedulingUnitId: lesson.id,
      courseId: course.id,
      lessonId: lesson.id,
      runningMeanResponseTime: 6,
      runningStdDevResponseTime: 1,
      m2: 2,
      totalCorrectReviews: 2,
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

  it('round-trips a pre-Course Deck and Folder backup without losing content', async () => {
    const deck = await createDeck('Organic chemistry');
    await db.folders.add({
      id: 'folder-organic',
      name: 'Chemistry',
      parentId: null,
      createdAt: deck.createdAt - 1,
    });
    await db.decks.update(deck.id, { folderId: 'folder-organic' });
    const card = await createCard(deck.id, 'front_back', 'Alkane formula', 'CnH2n+2');
    const current = await exportDatabase();
    const {
      courses: _courses,
      lessons: _lessons,
      courseAssessments: _assessments,
      schedulingUnits: _units,
      coursePerformance: _coursePerformance,
      schedulingPerformance: _schedulingPerformance,
      reviewHistory: _reviewHistory,
      ...legacyBackup
    } = current;

    await resetDatabase();
    await importBackup(legacyBackup as BackupFile, 'replace');

    expect(await db.decks.get(deck.id)).toMatchObject({
      name: 'Organic chemistry',
      folderId: 'folder-organic',
    });
    expect(await db.folders.get('folder-organic')).toMatchObject({ name: 'Chemistry' });
    expect(await db.cards.get(card.id)).toMatchObject({ front: 'Alkane formula', back: 'CnH2n+2' });
  });

  it.each(['LAC0', 'LAC1', 'LAC2', 'LAC3'] as const)(
    'imports a %s Deck share code into the Course model',
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

      const result = await importSharePayload(await decodeShareDirect(code));

      expect(result).toMatchObject({ courses: 1, lessons: 1, cards: 1 });
      expect(await db.courses.get(result.courseIds[0])).toMatchObject({ name: `${prefix} chemistry` });
      expect(await db.cards.where('courseId').equals(result.courseIds[0]).toArray()).toEqual([
        expect.objectContaining({ front: 'Water formula', back: 'H2O' }),
      ]);
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
