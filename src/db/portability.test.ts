import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup, validateBackup, BACKUP_VERSION } from './portability';
import {
  createCourse,
  createDeck,
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
} from './repository';

async function reset() {
  await Promise.all([
    db.decks.clear(),
    db.cards.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.assets.clear(),
    db.folders.clear(),
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
  ]);
}

describe('exportDatabase', () => {
  beforeEach(reset);

  it('exports a valid BackupFile with the current version', async () => {
    const deck = await createDeck('Biology');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');

    const backup = await exportDatabase();

    expect(backup.app).toBe('lacuna');
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(validateBackup(backup)).toBe(true);
    expect(backup.decks).toHaveLength(1);
    expect(backup.decks[0].name).toBe('Biology');
    expect(backup.cards).toHaveLength(1);
    expect(backup.cards[0].front).toBe('Q1');
  });

  it('exports full assessment semantics and stable ids in version 8', async () => {
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

    expect(backup.version).toBe(8);
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
    const deck = await createDeck('Biology');
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
    });

    const backup = await exportDatabase();
    expect(backup.cards[0].history[0]).toEqual(
      expect.objectContaining({
        eventId: 'event-portability',
        sessionId: 'session-portability',
        sessionKind: 'deck',
        revisionPlanId: 'plan-1',
        revisionWindowId: 'window-1',
        correct: true,
        hintUsed: true,
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
    await db.decks.clear();
    await importBackup(backup, 'replace');

    const restored = await db.cards.toArray();
    expect(restored[0].history[0]).toEqual(backup.cards[0].history[0]);
  });
});

describe('importBackup', () => {
  beforeEach(reset);

  it('replaces the database in replace mode', async () => {
    const deck = await createDeck('Old');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();

    await createDeck('Extra');
    expect(await db.decks.count()).toBe(2);

    await importBackup(backup, 'replace');

    const decks = await db.decks.toArray();
    const cards = await db.cards.toArray();
    expect(decks).toHaveLength(1);
    expect(decks[0].name).toBe('Old');
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('Q1');
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
    const deck = await createDeck('Biology');
    const backup = await exportDatabase();

    // Simulate local activity so lastInteractedAt is strictly newer than the
    // backup's. Offsetting the captured value keeps this deterministic: relying
    // on Date.now() advancing fails when both writes land in the same
    // millisecond (the merge tie-break favours the backup, so local must be
    // unambiguously newer).
    await db.decks.update(deck.id, {
      examDate: deck.examDate + 1000,
      lastInteractedAt: (deck.lastInteractedAt ?? deck.createdAt) + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.decks.get(deck.id);
    expect(updated!.examDate).toBe(deck.examDate + 1000); // local wins because more recently interacted
  });

  it('adds missing cards in merge mode', async () => {
    const deck = await createDeck('MergeDeck');
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
    const deck = await createDeck('HistoryDeck');
    const backup = await exportDatabase();

    await db.sessionHistory.add({
      timestamp: 1000,
      deckId: deck.id,
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
    const deck = await createDeck('HistoryDeck');
    const backup = await exportDatabase();
    const event = {
      eventId: 'event-merge',
      sessionId: 'session-merge',
      timestamp: 1000,
      deckId: deck.id,
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

  it('imports an older backup without a sequences array cleanly', async () => {
    const deck = await createDeck('Legacy');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();
    const legacyBackup = { ...backup };
    delete legacyBackup.sequences;

    await importBackup(legacyBackup, 'replace');

    expect(await db.sequences.count()).toBe(0);
    const decks = await db.decks.toArray();
    expect(decks).toHaveLength(1);
  });

  it('clears newer optional tables omitted by a legacy backup in replace mode', async () => {
    const course = await createCourse('Legacy Course');
    const lesson = await createLesson(course.id, 'Legacy Lesson');
    const note = await createNote(lesson.id, 'Legacy Note', 'Cell membrane');
    const deck = await createDeck('Legacy Deck');
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
