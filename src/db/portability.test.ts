import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup, validateBackup, BACKUP_VERSION } from './portability';
import {
  createCourse,

  createCard,
  createLesson,
  createNote,
  createPracticeNode,
  createCourseAssessment,
  createLessonCard,
  createSequence,
  createNoteAnnotation,
  markLessonComplete,
  recordReview,
  savePracticeMilestoneProgress,
  upsertLessonCardExposure,
  createOrResumeRevisionPlan,
  startRevisionWindow,
} from './repository';
import {
  performanceForCourseBackingDecks,
  performanceForReviewUnit,
} from './backingDecks';
import { createOcclusion } from './occlusionRepository';
import { reviewHistoryEntryIdForEvent } from './reviewHistory';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { storeImageBlob } from './assets';

async function reset() {
  await Promise.all([
    db.schedulingUnits.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
    db.cards.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.assets.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.noteAnnotations.clear(),
    db.lessonCards.clear(),
    db.lessonCardExposures.clear(),
    db.lessonCompletions.clear(),
    db.practiceNodes.clear(),
    db.practiceMilestones.clear(),
    db.courseAssessments.clear(),
    db.sequences.clear(),
    db.occlusions.clear(),
    db.revisionPlans.clear(),
    db.reviewHistory.clear(),
  ]);
}

async function waitForSessionHistory(eventId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await db.sessionHistory.where('eventId').equals(eventId).count()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for session history ${eventId}.`);
}

describe('exportDatabase', () => {
  beforeEach(reset);

  it('exports a valid BackupFile with the current version', async () => {
    const deck = await createCourse('Biology');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');

    const backup = await exportDatabase();

    expect(backup.app).toBe('lacuna');
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(validateBackup(backup)).toBe(true);
    expect(backup.decks).toBeUndefined();
    expect(backup.courses).toHaveLength(1);
    expect(backup.courses?.[0].name).toBe('Biology');
    expect(backup.cards).toHaveLength(1);
    expect(backup.cards[0].front).toBe('Q1');
    expect(backup.reviewHistory).toEqual([]);
  });

  it('exports full assessment semantics and stable ids in version 9', async () => {
    const course = await createCourse('Chemistry', { examDate: 1_900_000_000_000 });
    const lesson = await createLesson(course.id, 'Bonding');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
    await createCourseAssessment(course.id, 'Paper 1', 1_800_000_000_000, {
      afterLessonId: lesson.id,
      coverageMode: 'custom',
      lessonIds: [lesson.id],
      excludedCardIds: [card.id],
    });

    const backup = await exportDatabase();

    expect(backup.version).toBe(9);
    expect(backup.courses?.[0]).not.toHaveProperty('examDate');
    expect(backup.courseAssessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Paper 1',
          afterLessonId: lesson.id,
          coverageMode: 'custom',
          lessonIds: [lesson.id],
          excludedCardIds: [card.id],
        }),
      ]),
    );
    expect(backup.courseExamDates).toBeUndefined();
  });

  it('preserves final and checkpoint identities through replace restore', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Bonding');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    const checkpoint = await createCourseAssessment(course.id, 'Paper 1', 1_900_000_000_000, {
      afterLessonId: lesson.id,
      coverageMode: 'custom',
      lessonIds: [lesson.id],
      excludedCardIds: [card.id],
      needsAuthorConfirmation: true,
    });
    const before = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    const backup = await exportDatabase();

    await importBackup(backup, 'replace');

    const after = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    expect(after).toEqual(expect.arrayContaining(before));
    expect(after.find((assessment) => assessment.id === checkpoint.id)).toEqual(checkpoint);
  });

  it('round-trips complete review provenance through export and import', async () => {
    const deck = await createCourse('Biology');
    const card = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    await recordReview({
      card,
      eventId: 'event-portability',
      sessionId: 'session-portability',
      sessionKind: 'deck',
      revisionPlanId: 'plan-1',
      revisionWindowId: 'window-1',
      deck,
      grade: 3,
      responseTimeSec: 4,
      distracted: false,
      hintUsed: true,
      correct: true,
      checkerDisputes: [
        {
          reportedAt: 1_725_123_456_789,
          question: 'Q1',
          studentLine: 'A1',
          verdict: { correct: true, marksEarned: 1 },
          checkerSeeds: [],
        },
      ],
    });

    await waitForSessionHistory('event-portability');
    const backup = await exportDatabase();
    expect(backup.reviewHistory).toEqual([
      expect.objectContaining({ id: reviewHistoryEntryIdForEvent('event-portability') }),
    ]);
    expect(backup.cards[0].history[0]).toEqual(
      expect.objectContaining({
        eventId: 'event-portability',
        sessionId: 'session-portability',
        sessionKind: 'deck',
        revisionPlanId: 'plan-1',
        revisionWindowId: 'window-1',
        correct: true,
        hintUsed: true,
        checkerDisputes: [
          {
            reportedAt: 1_725_123_456_789,
            question: 'Q1',
            studentLine: 'A1',
            verdict: { correct: true, marksEarned: 1 },
            checkerSeeds: [],
          },
        ],
      }),
    );
    expect(backup.sessionHistory[0]).toEqual(
      expect.objectContaining({
        eventId: 'event-portability',
        sessionId: 'session-portability',
        revisionPlanId: 'plan-1',
        revisionWindowId: 'window-1',
      }),
    );

    await db.cards.clear();
    await db.schedulingUnits.clear();
    await importBackup(backup, 'replace');

    const restored = await db.cards.toArray();
    expect(restored[0].history[0]).toEqual(backup.cards[0].history[0]);
    expect(
      await db.reviewHistory.get(reviewHistoryEntryIdForEvent('event-portability')),
    ).toBeDefined();
  });

  it.each(['replace', 'merge'] as const)(
    'round-trips one review event exactly once in %s mode',
    async (mode) => {
      const deck = await createCourse('Review history portability');
      const card = await createCard(deck.id, 'front_back', 'Q', 'A');
      await recordReview({
        card,
        eventId: 'event-portability-consistency',
        sessionId: 'session-portability-consistency',
        sessionKind: 'deck',
        deck,
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        correct: true,
        now: 1_725_123_456_789,
      });

      const backup = await exportDatabase();
      const exportedCard = backup.cards.find((candidate) => candidate.id === card.id)!;
      const exportedEvent = backup.reviewHistory!.find(
        (entry) => entry.eventId === 'event-portability-consistency',
      )!;
      await Promise.all([
        db.cards.clear(),
        db.schedulingUnits.clear(),
        db.reviewHistory.clear(),
        db.sessionHistory.clear(),
        db.userPerformance.clear(),
      ]);

      let localCardId: string | undefined;
      if (mode === 'merge') {
        const localDeck = await createCourse('Local merge data');
        const localCard = await createCard(localDeck.id, 'front_back', 'Local Q', 'Local A');
        await recordReview({
          card: localCard,
          eventId: 'event-local-merge-data',
          sessionId: 'session-local-merge-data',
          sessionKind: 'deck',
          deck: localDeck,
          grade: 3,
          responseTimeSec: 1,
          distracted: false,
          correct: true,
          now: 1_725_123_456_788,
        });
        localCardId = localCard.id;
      }

      await importBackup(backup, mode);
      if (mode === 'merge') {
        expect(await db.cards.get(localCardId!)).toBeDefined();
        expect(
          (await db.reviewHistory.toArray()).filter(
            (entry) => entry.eventId === 'event-local-merge-data',
          ).length,
        ).toBe(1);
        await importBackup(backup, mode);
      }

      const restoredCard = (await db.cards.get(card.id))!;
      const restoredEvents = await db.reviewHistory.where('cardId').equals(card.id).toArray();
      const hydrated = (await hydrateCardsWithHistory([restoredCard]))[0];
      expect(restoredCard.history).toEqual(exportedCard.history);
      expect(restoredCard.history).toHaveLength(1);
      expect(restoredEvents).toHaveLength(1);
      expect(restoredEvents[0]).toMatchObject({
        ...exportedEvent,
        schedulingUnitId: card.deckId,
      });
      const {
        id: _eventId,
        cardId: _eventCardId,
        deckId: _eventDeckId,
        courseId: _eventCourseId,
        primaryLessonId: _eventLessonId,
        schedulingUnitId: _eventSchedulingUnitId,
        ...exportedEventContent
      } = exportedEvent;
      expect(hydrated.history[0]).toMatchObject(exportedEventContent);
      expect(hydrated.history).toHaveLength(1);
    },
  );

  it('round-trips complete revision-plan state through replace restore', async () => {
    const now = Date.parse('2026-07-17T08:00:00Z');
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    await upsertLessonCardExposure(lesson.id, card.id, now - 1);
    const assessment = await createCourseAssessment(
      course.id,
      'Paper 1',
      Date.parse('2026-07-19T12:00:00Z'),
      { timeZone: 'UTC', afterLessonId: lesson.id },
    );
    const plan = await createOrResumeRevisionPlan(
      assessment.id,
      25,
      {
        projectionMode: 'fsrs-6-practice-fallback',
        memoryModelVersion: 'fsrs-6',
        fallbackReason: 'unsupported',
      },
      now,
    );
    const backup = await exportDatabase();

    await db.revisionPlans.clear();
    await importBackup(backup, 'replace');
    expect(await db.revisionPlans.get(plan.id)).toEqual(plan);
    expect(backup.revisionPlans?.[0]).toEqual(
      expect.objectContaining({
        assessmentId: assessment.id,
        input: expect.objectContaining({
          coverageVersion: expect.stringMatching(/^v1-/),
          deadlineAt: assessment.examDate,
          timeZone: 'UTC',
          projection: expect.objectContaining({ memoryModelVersion: 'fsrs-6' }),
        }),
        windows: expect.any(Array),
        cardStates: [{ cardId: card.id, status: 'eligible' }],
      }),
    );
  });
});

describe('importBackup', () => {
  beforeEach(reset);

  it.each(['replace', 'merge'] as const)(
    'round-trips course and scheduling-unit performance distinctly in %s mode',
    async (mode) => {
      const course = await createCourse('Key-space portability');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
      const backing = {
        schedulingUnitId: card.schedulingUnitId,
        courseId: course.id,
        lessonId: lesson.id,
        runningMeanResponseTime: 41,
        runningStdDevResponseTime: 2,
        m2: 8,
        totalCorrectReviews: 9,
      };
      const calibration = {
        courseId: course.id,
        runningMeanResponseTime: 73,
        runningStdDevResponseTime: 3,
        m2: 18,
        totalCorrectReviews: 11,
      };
      await db.schedulingPerformance.put(backing);
      await db.coursePerformance.put(calibration);
      const backup = await exportDatabase();

      expect(backup.userPerformance).toEqual([]);
      expect(backup.schedulingPerformance).toEqual(expect.arrayContaining([backing]));
      expect(backup.coursePerformance).toEqual(expect.arrayContaining([calibration]));

      let expectedBacking = backing;
      let expectedCalibration = calibration;
      if (mode === 'merge') {
        const backingDeck = (await db.schedulingUnits.get(card.schedulingUnitId))!;
        const storedCourse = (await db.courses.get(course.id))!;
        expectedBacking = { ...backing, runningMeanResponseTime: 101, totalCorrectReviews: 21 };
        expectedCalibration = {
          ...calibration,
          runningMeanResponseTime: 202,
          totalCorrectReviews: 22,
        };
        await db.schedulingUnits.update(card.schedulingUnitId, {
          lastInteractedAt: (backingDeck.lastInteractedAt ?? backingDeck.createdAt) + 1000,
        });
        await db.courses.update(course.id, {
          lastInteractedAt: (storedCourse.lastInteractedAt ?? storedCourse.createdAt) + 1000,
        });
        await db.schedulingPerformance.put(expectedBacking);
        await db.coursePerformance.put(expectedCalibration);
      }

      await importBackup(backup, mode);

      expect(await db.schedulingPerformance.get(card.schedulingUnitId)).toEqual(expectedBacking);
      expect(await db.coursePerformance.get(course.id)).toEqual(expectedCalibration);
      const restoredCard = (await db.cards.get(card.id))!;
      expect(
        (await performanceForCourseBackingDecks(course.id, [restoredCard])).map(
          (row) => row.deckId,
        ),
      ).toEqual([card.schedulingUnitId]);
      expect(await performanceForReviewUnit(course.id, 'course')).toMatchObject({
        deckId: course.id,
      });
      expect(await performanceForReviewUnit(restoredCard.schedulingUnitId!)).toMatchObject({
        deckId: restoredCard.schedulingUnitId,
      });
    },
  );

  it('replaces the database in replace mode', async () => {
    const deck = await createCourse('Old');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();

    await createCourse('Extra');
    expect(await db.schedulingUnits.count()).toBe(2);

    await importBackup(backup, 'replace');

    const decks = await db.schedulingUnits.toArray();
    const cards = await db.cards.toArray();
    expect(decks).toHaveLength(1);
    expect(decks[0].name).toBe('Old');
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('Q1');
  });

  it('rejects malformed structured payloads before replacing the database', async () => {
    const deck = await createCourse('Protected');
    const card = await createCard(deck.id, 'front_back', 'Q', 'A');
    const backup = await exportDatabase();
    backup.cards[0] = {
      ...backup.cards[0],
      payload: { v: 1, kind: 'working', scheme: [] } as never,
    };

    expect(validateBackup(backup)).toBe(false);
    await expect(importBackup(backup, 'replace')).rejects.toThrow('Invalid backup file.');
    expect(await db.cards.get(card.id)).toBeDefined();
  });

  it('imports the explicit legacy courseExamDates boundary and preserves checkpoint ids', async () => {
    const course = await createCourse('Legacy course', { examDate: 1_900_000_000_000 });
    const lesson = await createLesson(course.id, 'Lesson 1');
    const checkpoint = await createCourseAssessment(course.id, 'Mid-term', 1_800_000_000_000, {
      afterLessonId: lesson.id,
      coverageMode: 'custom',
      lessonIds: [lesson.id],
    });
    const current = await exportDatabase();
    const legacy = {
      ...current,
      version: 6,
      courses: current.courses?.map((record) => ({
        ...record,
        examDate: 1_900_000_000_000,
        timeZone: 'UTC',
      })),
      courseExamDates: [
        {
          id: checkpoint.id,
          courseId: course.id,
          name: checkpoint.name,
          examDate: checkpoint.examDate,
          lessonIds: [lesson.id],
          createdAt: checkpoint.createdAt,
        },
      ],
      courseAssessments: undefined,
    };

    await importBackup(legacy, 'replace');

    const restored = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    expect(restored.filter((assessment) => assessment.kind === 'final')).toHaveLength(1);
    expect(restored.find((assessment) => assessment.id === checkpoint.id)).toEqual(
      expect.objectContaining({ coverageMode: 'custom', lessonIds: [lesson.id] }),
    );
  });

  it('merges decks by interaction time in merge mode', async () => {
    const deck = await createCourse('Biology');
    const backup = await exportDatabase();

    // Simulate local activity so lastInteractedAt is strictly newer than the
    // backup's. Offsetting the captured value keeps this deterministic: relying
    // on Date.now() advancing fails when both writes land in the same
    // millisecond (the merge tie-break favours the backup, so local must be
    // unambiguously newer).
    await db.schedulingUnits.update(deck.id, {
      examDate: deck.examDate + 1000,
      lastInteractedAt: (deck.lastInteractedAt ?? deck.createdAt) + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.schedulingUnits.get(deck.id);
    expect(updated!.examDate).toBe(deck.examDate + 1000); // local wins because more recently interacted
  });

  it('keeps same-event reviews from different cards when merging', async () => {
    const deck = await createCourse('MergeDeck');
    const first = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const second = await createCard(deck.id, 'front_back', 'Q2', 'A2');
    const base = await exportDatabase();
    const event = {
      eventId: 'same-event',
      timestamp: 1000,
      grade: 3 as const,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };
    await importBackup(
      {
        ...base,
        cards: [
          { ...first, history: [event] },
          { ...second, history: [{ ...event, timestamp: 2000 }] },
        ],
      },
      'merge',
    );

    expect(
      (await db.reviewHistory.toArray()).filter((entry) => entry.eventId === 'same-event'),
    ).toHaveLength(2);
  });

  it('preserves same-event rows across separate backup merges', async () => {
    const deck = await createCourse('MergeDeck');
    const first = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const second = await createCard(deck.id, 'front_back', 'Q2', 'A2');
    const base = await exportDatabase();
    const firstReview = {
      eventId: 'cross-backup-event',
      timestamp: 1000,
      grade: 3 as const,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };

    await importBackup({ ...base, cards: [{ ...first, history: [firstReview] }] }, 'merge');
    await importBackup(
      { ...base, cards: [{ ...second, history: [{ ...firstReview, timestamp: 2000 }] }] },
      'merge',
    );

    expect(
      (await db.reviewHistory.toArray()).filter((entry) => entry.eventId === 'cross-backup-event'),
    ).toHaveLength(2);
  });

  it('preserves distinct duplicate event rows on one card', async () => {
    const deck = await createCourse('MergeDeck');
    const card = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();
    const review = {
      eventId: 'duplicate-event',
      timestamp: 1000,
      grade: 3 as const,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 2,
      difficultyBefore: null,
      difficultyAfter: 5,
      retrievabilityAtReview: null,
    };

    await importBackup(
      { ...backup, cards: [{ ...card, history: [review, { ...review, timestamp: 2000 }] }] },
      'merge',
    );

    expect(
      (await db.reviewHistory.toArray()).filter((entry) => entry.eventId === 'duplicate-event'),
    ).toHaveLength(2);
  });

  it('adds missing cards in merge mode', async () => {
    const deck = await createCourse('MergeDeck');
    const card = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();

    await db.cards.delete(card.id);
    expect(await db.cards.count()).toBe(0);

    await importBackup(backup, 'merge');

    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('Q1');
  });

  it('appends non-duplicate session history in merge mode', async () => {
    const deck = await createCourse('HistoryDeck');
    const backup = await exportDatabase();

    await db.sessionHistory.add({
      timestamp: 1000,
      deckId: deck.id,
      schedulingUnitId: deck.id,
      averagePredictedRetrievability: 0.5,
    });

    const backupWithHistory = {
      ...backup,
      sessionHistory: [
        { timestamp: 1000, deckId: deck.id, averagePredictedRetrievability: 0.6 },
        { timestamp: 2000, deckId: deck.id, averagePredictedRetrievability: 0.7 },
      ],
    };

    await importBackup(backupWithHistory, 'merge');

    const history = await db.sessionHistory.toArray();
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.timestamp).sort()).toEqual([1000, 2000]);
  });

  it('deduplicates replayed event ids within and across merged backups', async () => {
    const deck = await createCourse('HistoryDeck');
    const backup = await exportDatabase();
    const event = {
      eventId: 'event-merge',
      sessionId: 'session-merge',
      timestamp: 1000,
      deckId: deck.id,
      schedulingUnitId: deck.id,
      averagePredictedRetrievability: 0.5,
    };
    const duplicate = {
      ...event,
      timestamp: 2000,
      averagePredictedRetrievability: 0.9,
    };

    await importBackup({ ...backup, sessionHistory: [event, duplicate] }, 'merge');
    await importBackup({ ...backup, sessionHistory: [duplicate] }, 'merge');

    expect(await db.sessionHistory.toArray()).toEqual([expect.objectContaining(event)]);
  });

  it('round-trips a course, lesson and note in replace mode', async () => {
    const course = await createCourse('Biology A-Level');
    const lesson = await createLesson(course.id, 'Cells');
    await createNote(lesson.id, 'Cell Structure', '## Cell wall\nRigid outer layer.');
    const backup = await exportDatabase();

    // Populate some extra data that should be wiped on restore.
    await createCourse('Ephemeral');
    expect(await db.courses.count()).toBe(2);

    await importBackup(backup, 'replace');

    const courses = await db.courses.toArray();
    const lessons = await db.lessons.toArray();
    const notes = await db.notes.toArray();
    expect(courses).toHaveLength(1);
    expect(courses[0].name).toBe('Biology A-Level');
    expect(lessons).toHaveLength(1);
    expect(lessons[0].name).toBe('Cells');
    expect(notes).toHaveLength(1);
    expect(notes[0].name).toBe('Cell Structure');
  });

  it('keeps a locally edited note when an incoming backup has the same creation time', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const note = await createNote(lesson.id, 'Cell note', 'Old content');
    const backup = await exportDatabase();

    await db.notes.update(note.id, { content: 'Local edit' });
    await importBackup(backup, 'merge');

    expect((await db.notes.get(note.id))?.content).toBe('Local edit');
  });

  it('uses course interaction time when merging course calibration', async () => {
    const course = await createCourse('Biology');
    await db.userPerformance.put({
      deckId: course.id,
      runningMeanResponseTime: 10,
      runningStdDevResponseTime: 0,
      m2: 0,
      totalCorrectReviews: 1,
    });
    const backup = await exportDatabase();

    await db.courses.update(course.id, { lastInteractedAt: course.createdAt + 1000 });
    await db.userPerformance.update(course.id, {
      runningMeanResponseTime: 99,
      totalCorrectReviews: 2,
    });
    await importBackup(backup, 'merge');

    expect((await db.userPerformance.get(course.id))?.runningMeanResponseTime).toBe(99);
  });

  it('adds a missing course in merge mode without clobbering an existing local one', async () => {
    const existing = await createCourse('Local Course');
    const backup = await exportDatabase();

    // Create a second course locally after the backup was taken.
    await createCourse('New Local Course');
    expect(await db.courses.count()).toBe(2);

    // The backup contains only 'Local Course'.
    await importBackup(backup, 'merge');

    // 'Local Course' should remain; 'New Local Course' should not be wiped.
    const courses = await db.courses.toArray();
    expect(courses).toHaveLength(2);
    expect(courses.map((c) => c.id)).toContain(existing.id);
  });

  it('adds a missing practice node in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const node = await createPracticeNode(course.id, { type: 'manual', name: 'Node A' });
    const backup = await exportDatabase();

    await db.practiceNodes.delete(node.id);
    expect(await db.practiceNodes.count()).toBe(0);

    await importBackup(backup, 'merge');

    const nodes = await db.practiceNodes.toArray();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Node A');
  });

  it('resolves a practice node id collision by newer createdAt in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const node = await createPracticeNode(course.id, { type: 'manual', name: 'Old Name' });
    const backup = await exportDatabase();

    // Local copy is edited after the backup was taken, so its createdAt is newer.
    await db.practiceNodes.update(node.id, {
      name: 'New Name',
      createdAt: node.createdAt + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.practiceNodes.get(node.id);
    expect(updated!.name).toBe('New Name'); // local wins because more recently created/edited
  });

  it('adds a missing checkpoint in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const assessment = await createCourseAssessment(course.id, 'Paper 1', Date.now() + 86400000);
    const backup = await exportDatabase();

    await db.courseAssessments.delete(assessment.id);
    expect(await db.courseAssessments.count()).toBe(1);

    await importBackup(backup, 'merge');

    const assessments = await db.courseAssessments.toArray();
    expect(assessments).toHaveLength(2);
    expect(assessments.find((entry) => entry.kind === 'checkpoint')?.name).toBe('Paper 1');
  });

  it('resolves a checkpoint id collision by newer createdAt in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const assessment = await createCourseAssessment(course.id, 'Paper 1', Date.now() + 86400000);
    const backup = await exportDatabase();

    // Local copy is edited after the backup was taken, so its createdAt is newer.
    await db.courseAssessments.update(assessment.id, {
      name: 'Paper 1 (Resit)',
      createdAt: assessment.createdAt + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.courseAssessments.get(assessment.id);
    expect(updated!.name).toBe('Paper 1 (Resit)'); // local wins because more recently created/edited
  });

  it('round-trips a sequence in replace mode', async () => {
    const course = await createCourse('Chemistry');
    await createSequence(course.id, null, 'Group 1 metals', [
      { id: 'item-1', value: 'Lithium' },
      { id: 'item-2', value: 'Sodium' },
    ]);
    const backup = await exportDatabase();

    await createCourse('Ephemeral');
    expect(await db.courses.count()).toBe(2);

    await importBackup(backup, 'replace');

    const sequences = await db.sequences.toArray();
    expect(sequences).toHaveLength(1);
    expect(sequences[0].name).toBe('Group 1 metals');
    expect(sequences[0].items).toHaveLength(2);
    // The sequence's generated cards ride along as ordinary cards.
    const cards = await db.cards.where('sequenceItemId').equals('item-1').toArray();
    expect(cards).toHaveLength(1);
  });

  it('adds a missing sequence in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Group 1 metals', [
      { id: 'item-1', value: 'Lithium' },
    ]);
    const backup = await exportDatabase();

    await db.sequences.delete(sequence.id);
    expect(await db.sequences.count()).toBe(0);

    await importBackup(backup, 'merge');

    const sequences = await db.sequences.toArray();
    expect(sequences).toHaveLength(1);
    expect(sequences[0].name).toBe('Group 1 metals');
  });

  it('resolves a sequence id collision by newer createdAt in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Group 1 metals', [
      { id: 'item-1', value: 'Lithium' },
    ]);
    const backup = await exportDatabase();

    await db.sequences.update(sequence.id, {
      name: 'Group 1 metals (renamed)',
      createdAt: sequence.createdAt + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.sequences.get(sequence.id);
    expect(updated!.name).toBe('Group 1 metals (renamed)'); // local wins because more recently created/edited
  });

  it('round-trips an occlusion and its diagram in replace mode', async () => {
    const course = await createCourse('Biology');
    const asset = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      800,
      600,
    );
    await createOcclusion(course.id, null, 'Plant cell', asset.hash, [
      { id: 'region-1', role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
      { id: 'region-2', role: 'label', shape: 'rectangle', x: 0.5, y: 0.4, w: 0.2, h: 0.1 },
    ]);
    const backup = await exportDatabase();
    // The diagram is referenced only by Occlusion.assetHash, never by card Markdown,
    // so a backup that gathered assets from card content alone would lose it.
    expect(backup.assets.map((a) => a.hash)).toContain(asset.hash);

    await createCourse('Ephemeral');
    await importBackup(backup, 'replace');

    const occlusions = await db.occlusions.toArray();
    expect(occlusions).toHaveLength(1);
    expect(occlusions[0].name).toBe('Plant cell');
    expect(occlusions[0].regions).toHaveLength(2);
    expect(await db.assets.get(asset.hash)).toBeDefined();
    // Generated cards ride along as ordinary cards, anchored by region id.
    const cards = await db.cards.where('occlusionRegionId').equals('region-1').toArray();
    expect(cards).toHaveLength(1);
  });

  it('adds a missing occlusion in merge mode and keeps the newer copy on collision', async () => {
    const course = await createCourse('Biology');
    const asset = await storeImageBlob(
      new Blob(['diagram'], { type: 'image/png' }),
      'image/png',
      800,
      600,
    );
    const occlusion = await createOcclusion(course.id, null, 'Plant cell', asset.hash, [
      { id: 'region-1', role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
    ]);
    const backup = await exportDatabase();

    await db.occlusions.delete(occlusion.id);
    await importBackup(backup, 'merge');
    expect((await db.occlusions.toArray())[0].name).toBe('Plant cell');

    await db.occlusions.update(occlusion.id, {
      name: 'Plant cell (renamed)',
      createdAt: occlusion.createdAt + 1000,
    });
    await importBackup(backup, 'merge');
    // Local wins because it was more recently created/edited.
    expect((await db.occlusions.get(occlusion.id))!.name).toBe('Plant cell (renamed)');
  });

  it('imports an older backup without an occlusions array cleanly', async () => {
    const deck = await createCourse('Legacy');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();
    const legacyBackup = { ...backup };
    delete legacyBackup.occlusions;

    await importBackup(legacyBackup, 'replace');

    expect(await db.occlusions.count()).toBe(0);
    expect(await db.schedulingUnits.count()).toBe(1);
  });

  it('imports an older backup without a sequences array cleanly', async () => {
    const deck = await createCourse('Legacy');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();
    const legacyBackup = { ...backup };
    delete legacyBackup.sequences;

    await importBackup(legacyBackup, 'replace');

    expect(await db.sequences.count()).toBe(0);
    const decks = await db.schedulingUnits.toArray();
    expect(decks).toHaveLength(1);
  });

  it('clears plans when a legacy replace backup omits them', async () => {
    const course = await createCourse('Legacy');
    const assessment = await createCourseAssessment(course.id, 'Paper', Date.now() + 86_400_000);
    await createOrResumeRevisionPlan(assessment.id, 15, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });
    const backup = await exportDatabase();
    delete backup.revisionPlans;

    await importBackup(backup, 'replace');
    expect(await db.revisionPlans.count()).toBe(0);
  });

  it('merges plans by assessment while preserving local identity, active work and history', async () => {
    const now = Date.parse('2026-07-17T08:00:00Z');
    const course = await createCourse('Biology');
    const assessment = await createCourseAssessment(
      course.id,
      'Paper',
      Date.parse('2026-07-19T12:00:00Z'),
      { timeZone: 'UTC' },
    );
    const plan = await createOrResumeRevisionPlan(
      assessment.id,
      15,
      {
        projectionMode: 'fsrs-6-practice-fallback',
        memoryModelVersion: 'fsrs-6',
        fallbackReason: 'missing',
      },
      now,
    );
    await startRevisionWindow(plan.id, plan.windows[0].id, now + 1);
    const backup = await exportDatabase();
    const incoming = {
      ...backup.revisionPlans![0],
      id: 'incoming-plan-id',
      updatedAt: now + 100,
      completedSessions: [
        {
          id: 'remote-session',
          windowId: 'remote-window',
          startedAt: now + 2,
          completedAt: now + 3,
          cardIds: [],
          reviewEventIds: [],
        },
      ],
    };
    const incomingBackup = { ...backup, revisionPlans: [incoming] };

    await importBackup(incomingBackup, 'merge');
    await importBackup(incomingBackup, 'merge');
    const merged = await db.revisionPlans.where('assessmentId').equals(assessment.id).first();
    expect(merged?.id).toBe(plan.id);
    expect(merged?.windows.find((window) => window.id === plan.windows[0].id)?.status).toBe(
      'active',
    );
    expect(merged?.completedSessions).toEqual([incoming.completedSessions[0]]);
    expect(await db.revisionPlans.where('assessmentId').equals(assessment.id).count()).toBe(1);
  });

  it('remaps a merged final-assessment plan to the retained local assessment id', async () => {
    const course = await createCourse('Biology');
    const final = (await db.courseAssessments.where('courseId').equals(course.id).toArray()).find(
      (assessment) => assessment.kind === 'final',
    )!;
    const plan = await createOrResumeRevisionPlan(final.id, 15, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });
    const backup = await exportDatabase();
    const remoteFinalId = 'remote-final-id';
    const incoming = {
      ...backup,
      courseAssessments: backup.courseAssessments?.map((assessment) =>
        assessment.id === final.id ? { ...assessment, id: remoteFinalId } : assessment,
      ),
      revisionPlans: backup.revisionPlans?.map((entry) =>
        entry.id === plan.id
          ? {
              ...entry,
              id: 'remote-plan-id',
              assessmentId: remoteFinalId,
              updatedAt: entry.updatedAt + 1,
            }
          : entry,
      ),
    };

    await importBackup(incoming, 'merge');
    const plans = await db.revisionPlans.where('courseId').equals(course.id).toArray();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toEqual(expect.objectContaining({ id: plan.id, assessmentId: final.id }));
  });

  it('clears newer optional tables omitted by a legacy backup in replace mode', async () => {
    const course = await createCourse('Legacy Course');
    const lesson = await createLesson(course.id, 'Legacy Lesson');
    const note = await createNote(lesson.id, 'Legacy Note', 'Cell membrane');
    const deck = await createCourse('Legacy Deck');
    const card = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();
    const legacyBackup = { ...backup };
    delete legacyBackup.lessonCardExposures;
    delete legacyBackup.lessonCompletions;
    delete legacyBackup.practiceMilestones;

    await upsertLessonCardExposure(lesson.id, card.id, 100);
    await markLessonComplete(lesson.id, 200);
    await savePracticeMilestoneProgress('practice-legacy', course.id, 'scope-a', 1, 1, true, 300);
    await createNoteAnnotation(note.id, 0, 4, 'Cell');

    await importBackup(legacyBackup, 'replace');

    expect(await db.lessonCardExposures.count()).toBe(0);
    expect(await db.lessonCompletions.count()).toBe(0);
    expect(await db.practiceMilestones.count()).toBe(0);
    expect(await db.noteAnnotations.count()).toBe(0);
  });
});
