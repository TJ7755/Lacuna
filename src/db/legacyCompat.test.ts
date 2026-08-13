import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bytesToBase45 } from './base45';
import { ensureLessonBackingDeck } from './backingDecks';
import { exportDatabase, importBackup } from './portability';
import { reviewHistoryEntriesForCard } from './reviewHistory';
import { createCard, createCourse, createLesson } from './repository';
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

// Captured from exportDatabase() against schema v21. Keep this serialised fixture
// independent of live Deck APIs so it exercises the compatibility boundary after
// those stores are removed.
const preCourseV21Backup = {
  app: 'lacuna',
  version: 9,
  exportedAt: 1_786_617_442_465,
  decks: [
    {
      id: '045801f9-4c8b-4856-800d-cdf7e9f2fc5e',
      name: 'Organic chemistry',
      examDate: 1_787_266_740_000,
      timeZone: 'Europe/London',
      createdAt: 1_786_617_442_449,
      fsrsVersion: 6,
      fsrsParameters: {
        w: [
          0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
          0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
          0.0912, 0.0658, 0.1542,
        ],
        requestRetention: 0.9,
        enable_fuzz: false,
        maximum_interval: 36_500,
        learning_steps: ['1m', '10m'],
        relearning_steps: ['10m'],
      },
      examObjective: 'expectedMarks',
      lastInteractedAt: 1_786_617_442_449,
      folderId: 'folder-organic',
    },
  ],
  cards: [
    {
      id: 'd16311e9-3025-4513-91ea-401b522e6dae',
      deckId: '045801f9-4c8b-4856-800d-cdf7e9f2fc5e',
      type: 'front_back',
      front: 'Alkane formula',
      back: 'CnH2n+2',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 1_786_617_442_464,
      tags: [],
      suspended: false,
      buriedUntil: null,
      schedulingUnitId: '045801f9-4c8b-4856-800d-cdf7e9f2fc5e',
    },
  ],
  assets: [],
  sessionHistory: [],
  userPerformance: [
    {
      deckId: '045801f9-4c8b-4856-800d-cdf7e9f2fc5e',
      runningMeanResponseTime: 0,
      runningStdDevResponseTime: 0,
      m2: 0,
      totalCorrectReviews: 0,
    },
  ],
  folders: [
    {
      id: 'folder-organic',
      name: 'Chemistry',
      parentId: null,
      createdAt: 1_786_617_442_448,
    },
  ],
  notes: [],
  lessonCards: [],
  lessonCardExposures: [],
  lessonCompletions: [],
  practiceNodes: [],
  practiceMilestones: [],
  sequences: [],
  occlusions: [],
  revisionPlans: [],
} satisfies BackupFile;

const legacyV21BackingDeckBackup = {
  app: 'lacuna',
  version: 9,
  exportedAt: 1_786_617_442_500,
  decks: [
    {
      id: 'deck-biology',
      name: 'Biology backing deck',
      examDate: 1_787_266_740_000,
      timeZone: 'Europe/London',
      createdAt: 1_786_617_442_450,
      fsrsVersion: 6,
      fsrsParameters: preCourseV21Backup.decks[0].fsrsParameters,
      examObjective: 'expectedMarks',
      backingCourseId: 'course-biology',
      backingLessonId: 'lesson-cells',
    },
  ],
  courses: [
    {
      id: 'course-biology',
      name: 'Biology',
      description: '',
      createdAt: 1_786_617_442_451,
      fsrsVersion: 6,
      fsrsParameters: preCourseV21Backup.decks[0].fsrsParameters,
      examObjective: 'expectedMarks',
      unlockMode: 'open',
      autoPractice: true,
      practiceThresholdMinutesFar: 8,
      practiceThresholdMinutesNear: 4,
      practiceUrgentWindowDays: 7,
      practiceMaxGap: 2,
    },
  ],
  lessons: [
    {
      id: 'lesson-cells',
      courseId: 'course-biology',
      name: 'Cells',
      orderIndex: 0,
      createdAt: 1_786_617_442_452,
      isExtension: false,
    },
  ],
  courseAssessments: [
    {
      id: 'assessment-biology-final',
      courseId: 'course-biology',
      name: 'Final exam',
      kind: 'final',
      examDate: 1_787_266_740_000,
      afterLessonId: 'lesson-cells',
      coverageMode: 'prefix',
      excludedCardIds: [],
      createdAt: 1_786_617_442_453,
    },
  ],
  cards: [
    {
      id: 'card-biology',
      deckId: 'deck-biology',
      courseId: 'course-biology',
      primaryLessonId: 'lesson-cells',
      schedulingUnitId: 'lesson-cells',
      type: 'front_back',
      front: 'What is a cell?',
      back: 'The basic unit of life.',
      stability: 3.1,
      difficulty: 5.5,
      lastReviewed: reviews[1].timestamp,
      reps: reviews.length,
      lapses: 1,
      state: 2,
      due: 1_700_172_800_000,
      scheduledDays: 2,
      learningSteps: 0,
      history: reviews,
      createdAt: 1_786_617_442_454,
      tags: ['biology'],
      suspended: false,
      buriedUntil: null,
    },
  ],
  reviewHistory: reviews.map((review) => ({
    ...review,
    id: `review:event:${review.eventId}`,
    cardId: 'card-biology',
    deckId: 'deck-biology',
    courseId: 'course-biology',
    primaryLessonId: 'lesson-cells',
    schedulingUnitId: 'lesson-cells',
  })),
  schedulingUnits: [
    {
      id: 'course-biology',
      createdAt: 1_786_617_442_451,
      kind: 'course',
      courseId: 'course-biology',
      lessonId: null,
      name: 'Biology',
      examDate: 1_787_266_740_000,
      timeZone: 'Europe/London',
      fsrsVersion: 6,
      fsrsParameters: preCourseV21Backup.decks[0].fsrsParameters,
      examObjective: 'expectedMarks',
    },
    {
      id: 'lesson-cells',
      createdAt: 1_786_617_442_452,
      kind: 'lesson',
      courseId: 'course-biology',
      lessonId: 'lesson-cells',
      name: 'Cells',
      examDate: 1_787_266_740_000,
      timeZone: 'Europe/London',
      fsrsVersion: 6,
      fsrsParameters: preCourseV21Backup.decks[0].fsrsParameters,
      examObjective: 'expectedMarks',
    },
  ],
  coursePerformance: [
    {
      courseId: 'course-biology',
      runningMeanResponseTime: 6,
      runningStdDevResponseTime: 1,
      m2: 2,
      totalCorrectReviews: 2,
    },
  ],
  schedulingPerformance: [
    {
      schedulingUnitId: 'course-biology',
      courseId: 'course-biology',
      runningMeanResponseTime: 4,
      runningStdDevResponseTime: 1,
      m2: 1,
      totalCorrectReviews: 1,
    },
    {
      schedulingUnitId: 'lesson-cells',
      courseId: 'course-biology',
      lessonId: 'lesson-cells',
      runningMeanResponseTime: 7,
      runningStdDevResponseTime: 2,
      m2: 8,
      totalCorrectReviews: 3,
    },
  ],
  assets: [],
  sessionHistory: [],
  userPerformance: [
    {
      deckId: 'deck-biology',
      runningMeanResponseTime: 7,
      runningStdDevResponseTime: 2,
      m2: 8,
      totalCorrectReviews: 3,
    },
    {
      deckId: 'course-biology',
      runningMeanResponseTime: 4,
      runningStdDevResponseTime: 1,
      m2: 1,
      totalCorrectReviews: 1,
    },
  ],
  folders: [],
} satisfies BackupFile;

describe('legacy storage compatibility net', () => {
  beforeEach(resetDatabase);

  it('imports a v21 backing-deck backup without changing review identity, order or performance', async () => {
    await importBackup(legacyV21BackingDeckBackup, 'replace');

    const restoredCard = await db.cards.get('card-biology');
    expect(restoredCard).toMatchObject({
      deckId: 'deck-biology',
      courseId: 'course-biology',
      primaryLessonId: 'lesson-cells',
      schedulingUnitId: 'lesson-cells',
    });
    expect(restoredCard?.history).toEqual(reviews);

    const restoredEvents = await db.reviewHistory
      .where('cardId')
      .equals('card-biology')
      .sortBy('timestamp');
    expect(restoredEvents).toEqual(legacyV21BackingDeckBackup.reviewHistory);
    expect(restoredEvents.map((event) => event.eventId)).toEqual([
      'event-first',
      'event-second',
    ]);
    expect(await db.coursePerformance.get('course-biology')).toEqual(
      legacyV21BackingDeckBackup.coursePerformance[0],
    );
    expect(await db.schedulingPerformance.get('lesson-cells')).toEqual(
      legacyV21BackingDeckBackup.schedulingPerformance[1],
    );
  });

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
    const report = await importBackup(preCourseV21Backup, 'replace');
    const deckId = preCourseV21Backup.decks![0].id;
    const cardId = preCourseV21Backup.cards[0].id;

    expect(report).toEqual({ discardedFolderNames: ['Chemistry'] });
    expect(await db.courses.get(deckId)).toMatchObject({
      id: deckId,
      name: 'Organic chemistry',
    });
    expect(await db.schedulingUnits.get(deckId)).toMatchObject({
      id: deckId,
      kind: 'course',
      courseId: deckId,
      lessonId: null,
    });
    expect(await db.cards.toArray()).toHaveLength(1);
    expect(await db.cards.get(cardId)).toMatchObject({
      courseId: deckId,
      schedulingUnitId: deckId,
      front: 'Alkane formula',
      back: 'CnH2n+2',
    });
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
