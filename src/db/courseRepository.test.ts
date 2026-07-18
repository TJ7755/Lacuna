import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createBasicReversedPair,
  createCard,
  createCardWithReverse,
  createCourse,
  createCourseAssessment,
  createDeck,
  createLesson,
  createLessonBasicReversedPair,
  createLessonCard,
  createLessonCardWithReverse,
  createNote,
  createPracticeNode,
  deleteCourse,
  deleteCourseAssessment,
  deleteLesson,
  ensureLessonDeck,
  ensureCourseBankDeck,
  createCourseCard,
  createCourseCardWithReverse,
  createCourseBasicReversedPair,
  createSequence,
  assignCardsToLesson,
  detachCourse,
  linkCardsToLesson,
  linkCardToLesson,
  listNotes,
  recordReview,
  reorderLessons,
  publishCourse,
  restoreCourse,
  restoreLesson,
  snapshotCourse,
  snapshotLesson,
  stampMissingLessonViewModes,
  updateCourse,
  updateCourseAssessment,
  createOrResumeRevisionPlan,
} from './repository';
import { FSRS_VERSION } from '../fsrs/params';
import { listLessons, listCardsForCourse } from './read';
import { resolveAssessmentCoverage } from '../course/assessmentCoverage';

async function reset() {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.noteAnnotations.clear(),
    db.lessonCards.clear(),
    db.lessonCardExposures.clear(),
    db.lessonCompletions.clear(),
    db.practiceNodes.clear(),
    db.courseAssessments.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.userPerformance.clear(),
    db.sessionHistory.clear(),
    db.sequences.clear(),
    db.revisionPlans.clear(),
  ]);
}

describe('createCourse', () => {
  beforeEach(reset);

  it('applies all required defaults', async () => {
    const before = Date.now();
    const course = await createCourse('Biology');
    const after = Date.now();

    expect(course.name).toBe('Biology');
    expect(course.description).toBe('');
    expect(course.createdAt).toBeGreaterThanOrEqual(before);
    expect(course.createdAt).toBeLessThanOrEqual(after);
    expect(course.fsrsVersion).toBe(FSRS_VERSION);
    expect(course.fsrsParameters).toBeDefined();
    expect(course.examObjective).toBe('expectedMarks');
    expect(course.unlockMode).toBe('open');
    expect(course.autoPractice).toBe(true);
    expect(course.practiceThresholdMinutesFar).toBe(8);
    expect(course.practiceThresholdMinutesNear).toBe(4);
    expect(course.practiceUrgentWindowDays).toBe(7);
    expect(course.practiceMaxGap).toBe(2);
    // New courses default to edit mode (see src/course/lessonViewMode.ts).
    expect(course.lessonViewMode).toBe('edit');
    // examDate is 7 days ahead of createdAt at 23:59 local time.
    expect(course.examDate).toBeGreaterThan(course.createdAt);
    // id is generated.
    expect(typeof course.id).toBe('string');
    expect(course.id.length).toBeGreaterThan(0);
    // The compatibility date is derived from the separately persisted final assessment.
    const stored = await db.courses.get(course.id);
    expect(stored).toBeDefined();
    expect(stored).not.toHaveProperty('examDate');
    expect(stored).not.toHaveProperty('timeZone');
    const assessments = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    expect(assessments).toHaveLength(1);
    expect(assessments[0]).toMatchObject({
      kind: 'final',
      examDate: course.examDate,
      timeZone: course.timeZone,
      afterLessonId: null,
      coverageMode: 'prefix',
      excludedCardIds: [],
    });
  });

  it('opts override defaults', async () => {
    const course = await createCourse('Physics', { unlockMode: 'linear', autoPractice: false });
    expect(course.unlockMode).toBe('linear');
    expect(course.autoPractice).toBe(false);
  });

  it('seeds practice fields from the global practice defaults', async () => {
    const { writePracticeDefaults } = await import('../state/practiceDefaults');
    writePracticeDefaults({
      autoPractice: false,
      practiceThresholdMinutesFar: 90,
      practiceThresholdMinutesNear: 45,
      practiceUrgentWindowDays: 14,
      practiceMaxGap: 8,
    });

    const course = await createCourse('Chemistry');

    expect(course.autoPractice).toBe(false);
    expect(course.practiceThresholdMinutesFar).toBe(90);
    expect(course.practiceThresholdMinutesNear).toBe(45);
    expect(course.practiceUrgentWindowDays).toBe(14);
    expect(course.practiceMaxGap).toBe(8);

    localStorage.clear();
  });

  it('falls back to "Untitled course" for a blank name', async () => {
    const course = await createCourse('   ');
    expect(course.name).toBe('Untitled course');
  });

  it('keeps compatibility fields out of course writes and updates the final explicitly', async () => {
    const course = await createCourse('Biology');
    const movedDate = course.examDate + 86_400_000;
    const final = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .filter((assessment) => assessment.kind === 'final')
      .first();

    await updateCourse(course.id, { name: 'Advanced Biology' });
    await updateCourseAssessment(final!.id, {
      examDate: movedDate,
      timeZone: 'Europe/Paris',
    });

    expect(await db.courses.get(course.id)).toMatchObject({ name: 'Advanced Biology' });
    expect(await db.courses.get(course.id)).not.toHaveProperty('examDate');
    expect(await db.courses.get(course.id)).not.toHaveProperty('timeZone');
    expect(await db.courseAssessments.get(final!.id)).toMatchObject({
      examDate: movedDate,
      timeZone: 'Europe/Paris',
    });
  });

  it('rejects compatibility date fields at the course repository boundary', async () => {
    const course = await createCourse('Biology');
    await expect(
      updateCourse(course.id, { examDate: course.examDate + 1 } as Parameters<
        typeof updateCourse
      >[1]),
    ).rejects.toThrow('derived, read-only assessment values');
    expect(await db.courses.get(course.id)).not.toHaveProperty('examDate');
  });

  it('rejects a non-finite final date when creating a course', async () => {
    await expect(createCourse('Invalid', { examDate: Number.NaN })).rejects.toThrow(
      'finite timestamp',
    );
    expect(await db.courses.count()).toBe(0);
    expect(await db.courseAssessments.count()).toBe(0);
  });

  it('resolves the mandatory final assessment to cover every lesson and card', async () => {
    const course = await createCourse('Coverage regression');
    const first = await createLesson(course.id, 'First');
    const second = await createLesson(course.id, 'Second');
    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');
    await linkCardToLesson(second.id, card.id);
    const [finalAssessment] = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .toArray();

    const [lessons, cards] = await Promise.all([
      listLessons(course.id),
      listCardsForCourse(course.id),
    ]);
    const links = await db.lessonCards.toArray();
    const resolved = resolveAssessmentCoverage(finalAssessment, lessons, cards, links);

    expect(resolved.coveredLessons.map((lesson) => lesson.id)).toEqual([first.id, second.id]);
    expect(resolved.cards.map((resolvedCard) => resolvedCard.id)).toEqual([card.id]);
    expect(resolved.validation.valid).toBe(true);
  });
});

describe('createLesson orderIndex', () => {
  beforeEach(reset);

  it('first lesson gets orderIndex 0', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Week 1');
    expect(lesson.orderIndex).toBe(0);
  });

  it('subsequent lessons increment orderIndex', async () => {
    const course = await createCourse('History');
    const l1 = await createLesson(course.id, 'Week 1');
    const l2 = await createLesson(course.id, 'Week 2');
    const l3 = await createLesson(course.id, 'Week 3');
    expect(l1.orderIndex).toBe(0);
    expect(l2.orderIndex).toBe(1);
    expect(l3.orderIndex).toBe(2);
  });

  it('uses max existing orderIndex + 1 even after gaps', async () => {
    const course = await createCourse('History');
    await createLesson(course.id, 'A', { orderIndex: 10 });
    const next = await createLesson(course.id, 'B');
    expect(next.orderIndex).toBe(11);
  });

  it('defaults isExtension to false', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Week 1');
    expect(lesson.isExtension).toBe(false);
  });
});

describe('deleteCourse cascade', () => {
  beforeEach(reset);

  it('removes the course, all its lessons, notes, links, practice nodes, assessments, and cards', async () => {
    const course = await createCourse('Cascade test');
    const lesson1 = await createLesson(course.id, 'L1');
    const lesson2 = await createLesson(course.id, 'L2');
    await createNote(lesson1.id, 'Note A');
    await createNote(lesson2.id, 'Note B');

    // Create a deck and card that belongs to this course.
    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');
    await db.cards.update(card.id, { courseId: course.id });

    // Link the card to lesson1.
    await linkCardToLesson(lesson1.id, card.id);

    // Add a practice node.
    await createPracticeNode(course.id, { type: 'manual', name: 'Practice 1' });

    // Add a checkpoint alongside the course's final assessment.
    const assessment = await createCourseAssessment(
      course.id,
      'Mid-term',
      Date.now() + 7 * 86400000,
    );
    const revisionPlan = await createOrResumeRevisionPlan(assessment.id, 20, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });

    // Verify rows exist.
    expect(await db.lessons.where('courseId').equals(course.id).count()).toBe(2);
    expect(await db.notes.count()).toBe(2);
    expect(await db.lessonCards.count()).toBe(1);
    expect(await db.practiceNodes.where('courseId').equals(course.id).count()).toBe(1);
    expect(await db.courseAssessments.where('courseId').equals(course.id).count()).toBe(2);
    expect(await db.revisionPlans.get(revisionPlan.id)).toBeDefined();
    expect(await db.cards.where('courseId').equals(course.id).count()).toBe(1);

    await deleteCourse(course.id);

    expect(await db.courses.get(course.id)).toBeUndefined();
    expect(await db.lessons.where('courseId').equals(course.id).count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
    expect(await db.lessonCards.count()).toBe(0);
    expect(await db.practiceNodes.where('courseId').equals(course.id).count()).toBe(0);
    expect(await db.courseAssessments.where('courseId').equals(course.id).count()).toBe(0);
    expect(await db.revisionPlans.get(revisionPlan.id)).toBeUndefined();
    expect(await db.cards.where('courseId').equals(course.id).count()).toBe(0);
  });

  it('also removes the lessons hidden backing decks, session history and calibration profiles', async () => {
    const course = await createCourse('Cascade backing-deck test');
    const lesson = await createLesson(course.id, 'L1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const deckId = card.deckId;

    await recordReview({
      card,
      eventId: 'event-delete-course',
      sessionId: 'session-delete-course',
      sessionKind: 'practice',
      deck: course,
      kind: 'course',
      grade: 3,
      responseTimeSec: 1,
      distracted: false,
      correct: true,
    });

    expect(await db.decks.get(deckId)).toBeDefined();
    expect(await db.userPerformance.get(deckId)).toBeDefined();
    expect(await db.userPerformance.get(course.id)).toBeDefined();
    expect(await db.sessionHistory.where('deckId').equals(deckId).count()).toBe(1);

    await deleteCourse(course.id);

    expect(await db.decks.get(deckId)).toBeUndefined();
    expect(await db.userPerformance.get(deckId)).toBeUndefined();
    expect(await db.userPerformance.get(course.id)).toBeUndefined();
    expect(await db.sessionHistory.where('deckId').equals(deckId).count()).toBe(0);
    expect(await db.sessionHistory.where('courseId').equals(course.id).count()).toBe(0);
  });

  it('removes empty owned backing decks and course sequences', async () => {
    const course = await createCourse('Empty ownership');
    const lesson = await createLesson(course.id, 'Lesson');
    const emptyDeckId = await ensureLessonDeck(course.id, lesson.id);
    await createSequence(course.id, lesson.id, 'Sequence', []);

    expect(await db.cards.where('courseId').equals(course.id).count()).toBe(0);
    expect(await db.decks.get(emptyDeckId)).toBeDefined();
    expect(await db.sequences.where('courseId').equals(course.id).count()).toBe(1);

    await deleteCourse(course.id);

    expect(await db.decks.get(emptyDeckId)).toBeUndefined();
    expect(await db.userPerformance.get(emptyDeckId)).toBeUndefined();
    expect(await db.sequences.where('courseId').equals(course.id).count()).toBe(0);
  });
});

describe('snapshotCourse / restoreCourse', () => {
  beforeEach(reset);

  it('returns null for a course that does not exist', async () => {
    expect(await snapshotCourse('missing')).toBeNull();
  });

  it('restores everything deleteCourse removes, including backing decks and session history', async () => {
    const course = await createCourse('Undo test');
    const lesson1 = await createLesson(course.id, 'L1');
    const lesson2 = await createLesson(course.id, 'L2');
    const note = await createNote(lesson1.id, 'Note A');
    await db.noteAnnotations.add({
      id: 'course-annotation-1',
      noteId: note.id,
      startOffset: 0,
      endOffset: 4,
      selectedText: 'Note',
      createdAt: 1,
      updatedAt: 1,
    });
    const lessonCard = await createLessonCard(course.id, lesson1.id, 'front_back', 'q', 'a');
    const bankCard = await createCourseCard(course.id, 'front_back', 'q2', 'a2');
    await linkCardToLesson(lesson2.id, lessonCard.id);
    await createPracticeNode(course.id, { type: 'manual', name: 'Practice 1' });
    const assessment = await createCourseAssessment(
      course.id,
      'Mid-term',
      Date.now() + 7 * 86400000,
    );
    const revisionPlan = await createOrResumeRevisionPlan(assessment.id, 20, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });
    const sequence = await createSequence(course.id, lesson1.id, 'Sequence', [
      { id: 'sequence-item', value: 'Item' },
    ]);
    await recordReview({
      card: lessonCard,
      eventId: 'event-course-snapshot',
      sessionId: 'session-course-snapshot',
      sessionKind: 'lesson',
      deck: course,
      kind: 'course',
      grade: 3,
      responseTimeSec: 1,
      distracted: false,
      correct: true,
    });
    // Give a lesson some unlock state so restore fidelity can be asserted on it.
    const unlockedAt = Date.now();
    await db.lessons.update(lesson1.id, { unlockedAt });
    const cardBefore = await db.cards.get(lessonCard.id);
    expect(cardBefore!.stability).not.toBeNull();

    const snapshot = await snapshotCourse(course.id);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.decks).toHaveLength(2); // lesson1's deck + the course's bank deck
    expect(snapshot!.cards).toHaveLength(3); // two ordinary cards + one sequence card
    expect(snapshot!.sessionHistory).toHaveLength(1);
    expect(snapshot!.sequences).toEqual([sequence]);
    expect(snapshot!.revisionPlans).toEqual([revisionPlan]);
    // Both backing decks' own profiles (lesson + bank) plus the course-level aggregate.
    expect(snapshot!.userPerformance).toHaveLength(3);

    await deleteCourse(course.id);
    expect(await db.courses.get(course.id)).toBeUndefined();
    expect(await db.decks.get(lessonCard.deckId)).toBeUndefined();
    expect(await db.decks.get(bankCard.deckId)).toBeUndefined();

    await restoreCourse(snapshot!);

    expect(await db.courses.get(course.id)).toBeDefined();
    expect(await db.lessons.where('courseId').equals(course.id).count()).toBe(2);
    expect(await db.notes.where('lessonId').equals(lesson1.id).count()).toBe(1);
    expect(await db.noteAnnotations.get('course-annotation-1')).toBeDefined();
    expect(await db.lessonCards.where('lessonId').equals(lesson2.id).count()).toBe(1);
    expect(await db.practiceNodes.where('courseId').equals(course.id).count()).toBe(1);
    expect(await db.courseAssessments.where('courseId').equals(course.id).count()).toBe(2);
    expect(await db.cards.where('courseId').equals(course.id).count()).toBe(3);
    expect(await db.decks.get(lessonCard.deckId)).toBeDefined();
    expect(await db.decks.get(bankCard.deckId)).toBeDefined();
    expect(await db.userPerformance.get(lessonCard.deckId)).toBeDefined();
    expect(await db.userPerformance.get(course.id)).toBeDefined();
    expect(await db.sessionHistory.where('courseId').equals(course.id).count()).toBe(1);
    expect(await db.sequences.get(sequence.id)).toEqual(sequence);
    expect(await db.revisionPlans.get(revisionPlan.id)).toEqual(revisionPlan);

    // Field-level fidelity: the restored card keeps its FSRS memory state and
    // review history exactly, and the restored lesson keeps its unlock ratchet.
    const cardAfter = await db.cards.get(lessonCard.id);
    expect(cardAfter!.stability).toBe(cardBefore!.stability);
    expect(cardAfter!.difficulty).toBe(cardBefore!.difficulty);
    expect(cardAfter!.history).toEqual(cardBefore!.history);
    const lessonAfter = await db.lessons.get(lesson1.id);
    expect(lessonAfter!.unlockedAt).toBe(unlockedAt);
  });
});

describe('deleteLesson', () => {
  beforeEach(reset);

  it('removes notes and lessonCard links belonging to the lesson', async () => {
    const course = await createCourse('Lesson delete test');
    const lesson = await createLesson(course.id, 'L1');
    await createNote(lesson.id, 'Note A');
    await createNote(lesson.id, 'Note B');

    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');
    await linkCardToLesson(lesson.id, card.id);

    expect(await db.notes.where('lessonId').equals(lesson.id).count()).toBe(2);
    expect(await db.lessonCards.where('lessonId').equals(lesson.id).count()).toBe(1);

    await deleteLesson(lesson.id);

    expect(await db.lessons.get(lesson.id)).toBeUndefined();
    expect(await db.notes.where('lessonId').equals(lesson.id).count()).toBe(0);
    expect(await db.lessonCards.where('lessonId').equals(lesson.id).count()).toBe(0);
  });

  it('unassigns cards (sets primaryLessonId to null) rather than deleting them', async () => {
    const course = await createCourse('Lesson delete test');
    const lesson = await createLesson(course.id, 'L1');

    const deck = await createDeck('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    await db.cards.update(card.id, { primaryLessonId: lesson.id });

    const beforeDelete = await db.cards.get(card.id);
    expect(beforeDelete?.primaryLessonId).toBe(lesson.id);

    await deleteLesson(lesson.id);

    // Card survives; primaryLessonId is cleared.
    const afterDelete = await db.cards.get(card.id);
    expect(afterDelete).toBeDefined();
    expect(afterDelete?.primaryLessonId).toBeNull();
  });

  it('moves lesson sequences and generated cards to the course bank', async () => {
    const course = await createCourse('Lesson delete sequence test');
    const lesson = await createLesson(course.id, 'L1');
    const sequence = await createSequence(course.id, lesson.id, 'Sequence', [
      { id: 'item', value: 'Item' },
    ]);
    const lessonDeckId = (await db.cards.where('sequenceItemId').equals('item').first())!.deckId;

    await deleteLesson(lesson.id);

    const movedSequence = await db.sequences.get(sequence.id);
    const movedCard = await db.cards.where('sequenceItemId').equals('item').first();
    expect(movedSequence?.primaryLessonId).toBeNull();
    expect(movedCard?.primaryLessonId).toBeNull();
    expect(movedCard?.deckId).not.toBe(lessonDeckId);
    expect(await db.decks.get(lessonDeckId)).toBeUndefined();
  });

  it('restores every row deleted or rewritten by a lesson deletion', async () => {
    const course = await createCourse('Lesson undo test');
    const lesson = await createLesson(course.id, 'L1');
    const note = await createNote(lesson.id, 'Note', 'Body');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const sequence = await createSequence(course.id, lesson.id, 'Sequence', [
      { id: 'item', value: 'Item' },
    ]);
    const deckId = card.deckId;
    await db.noteAnnotations.add({
      id: 'annotation-1',
      noteId: note.id,
      startOffset: 0,
      endOffset: 4,
      selectedText: 'Body',
      createdAt: 1,
      updatedAt: 1,
    });
    await db.lessonCompletions.put({ lessonId: lesson.id, completedAt: 2 });

    const snapshot = await snapshotLesson(lesson.id);
    expect(snapshot).not.toBeNull();
    await deleteLesson(lesson.id);
    await restoreLesson(snapshot!);

    expect(await db.lessons.get(lesson.id)).toEqual(lesson);
    expect(await db.notes.get(note.id)).toEqual(note);
    expect(await db.noteAnnotations.get('annotation-1')).toBeDefined();
    expect(await db.lessonCompletions.get(lesson.id)).toEqual({
      lessonId: lesson.id,
      completedAt: 2,
    });
    expect((await db.cards.get(card.id))?.primaryLessonId).toBe(lesson.id);
    expect((await db.sequences.get(sequence.id))?.primaryLessonId).toBe(lesson.id);
    expect(await db.decks.get(deckId)).toBeDefined();
    expect(await db.userPerformance.get(deckId)).toBeDefined();
  });

  it('retargets assessment placement to the preceding lesson and restores it on undo', async () => {
    const course = await createCourse('Assessment lesson undo');
    const first = await createLesson(course.id, 'First');
    const middle = await createLesson(course.id, 'Middle');
    const last = await createLesson(course.id, 'Last');
    const checkpoint = await createCourseAssessment(course.id, 'Checkpoint', Date.now() + 1, {
      afterLessonId: middle.id,
      coverageMode: 'custom',
      lessonIds: [first.id, middle.id],
    });
    const snapshot = await snapshotLesson(middle.id);

    await deleteLesson(middle.id);

    expect(await db.courseAssessments.get(checkpoint.id)).toMatchObject({
      afterLessonId: first.id,
      coverageMode: 'custom',
      lessonIds: [first.id],
      needsAuthorConfirmation: true,
    });
    expect((await db.courseAssessments.get(checkpoint.id))?.afterLessonId).not.toBe(last.id);

    await restoreLesson(snapshot!);
    expect(await db.courseAssessments.get(checkpoint.id)).toEqual(checkpoint);
  });

  it('retargets a deleted first-lesson anchor to before the course, not its end', async () => {
    const course = await createCourse('Assessment first lesson delete');
    const first = await createLesson(course.id, 'First');
    const last = await createLesson(course.id, 'Last');
    const checkpoint = await createCourseAssessment(course.id, 'Checkpoint', Date.now() + 1, {
      afterLessonId: first.id,
    });

    await deleteLesson(first.id);

    expect(await db.courseAssessments.get(checkpoint.id)).toMatchObject({
      afterLessonId: null,
      needsAuthorConfirmation: true,
    });
    expect((await db.courseAssessments.get(checkpoint.id))?.afterLessonId).not.toBe(last.id);
  });

  it('removes the last deleted custom reference and leaves explicit invalid state', async () => {
    const course = await createCourse('Assessment custom delete');
    const lesson = await createLesson(course.id, 'Only covered lesson');
    const checkpoint = await createCourseAssessment(course.id, 'Checkpoint', Date.now() + 1, {
      afterLessonId: lesson.id,
      coverageMode: 'custom',
      lessonIds: [lesson.id],
    });

    await deleteLesson(lesson.id);

    expect(await db.courseAssessments.get(checkpoint.id)).toMatchObject({
      afterLessonId: null,
      coverageMode: 'custom',
      lessonIds: [],
      needsAuthorConfirmation: true,
    });
  });

  it('resolves a final assessment retargeted to null coverage after its anchor lesson is deleted', async () => {
    const course = await createCourse('Final lesson delete test');
    const first = await createLesson(course.id, 'First');
    const second = await createLesson(course.id, 'Second');
    const [finalAssessment] = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .toArray();
    await updateCourseAssessment(finalAssessment.id, { afterLessonId: first.id });

    await deleteLesson(first.id);

    const retargeted = await db.courseAssessments.get(finalAssessment.id);
    expect(retargeted?.afterLessonId).toBeNull();

    const lessons = await listLessons(course.id);
    const resolved = resolveAssessmentCoverage(retargeted!, lessons, [], []);

    expect(resolved.coveredLessons.map((lesson) => lesson.id)).toEqual([second.id]);
  });
});

describe('linkCardToLesson idempotency', () => {
  beforeEach(reset);

  it('returns the existing link without creating a duplicate on a second call', async () => {
    const course = await createCourse('Link test');
    const lesson = await createLesson(course.id, 'L1');
    const source = await createLesson(course.id, 'Source');
    const card = await createLessonCard(course.id, source.id, 'front_back', 'q', 'a');

    const first = await linkCardToLesson(lesson.id, card.id);
    const second = await linkCardToLesson(lesson.id, card.id);

    expect(first.id).toBe(second.id);
    expect(await db.lessonCards.where('lessonId').equals(lesson.id).count()).toBe(1);
  });

  it('creates distinct links for different cards in the same lesson', async () => {
    const course = await createCourse('Link test');
    const lesson = await createLesson(course.id, 'L1');
    const source = await createLesson(course.id, 'Source');
    const c1 = await createLessonCard(course.id, source.id, 'front_back', 'q1', 'a1');
    const c2 = await createLessonCard(course.id, source.id, 'front_back', 'q2', 'a2');

    await linkCardToLesson(lesson.id, c1.id);
    await linkCardToLesson(lesson.id, c2.id);

    const links = await db.lessonCards.where('lessonId').equals(lesson.id).toArray();
    expect(links).toHaveLength(2);
  });

  it('rejects a missing lesson or card', async () => {
    const course = await createCourse('Link test');
    const lesson = await createLesson(course.id, 'Target');
    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');

    await expect(linkCardToLesson('missing', card.id)).rejects.toThrow('lesson could not be found');
    await expect(linkCardToLesson(lesson.id, 'missing')).rejects.toThrow('could not be found');
    expect(await db.lessonCards.count()).toBe(0);
  });

  it('rejects cross-course and redundant primary-lesson links', async () => {
    const courseA = await createCourse('Course A');
    const courseB = await createCourse('Course B');
    const target = await createLesson(courseA.id, 'Target');
    const primary = await createLesson(courseA.id, 'Primary');
    const crossCourseCard = await createCourseCard(courseB.id, 'front_back', 'q', 'a');
    const primaryCard = await createLessonCard(courseA.id, primary.id, 'front_back', 'q2', 'a2');

    await expect(linkCardToLesson(target.id, crossCourseCard.id)).rejects.toThrow('same course');
    await expect(linkCardToLesson(primary.id, primaryCard.id)).rejects.toThrow(
      'already belonging to this lesson',
    );
    expect(await db.lessonCards.count()).toBe(0);
  });

  it('rolls back the whole batch when any card is invalid', async () => {
    const course = await createCourse('Link test');
    const target = await createLesson(course.id, 'Target');
    const source = await createLesson(course.id, 'Source');
    const valid = await createLessonCard(course.id, source.id, 'front_back', 'q', 'a');

    await expect(linkCardsToLesson(target.id, [valid.id, 'missing'])).rejects.toThrow(
      'could not be found',
    );
    expect(await db.lessonCards.count()).toBe(0);
  });

  it('serialises concurrent duplicate requests through the lessonCards write transaction', async () => {
    const course = await createCourse('Link test');
    const target = await createLesson(course.id, 'Target');
    const source = await createLesson(course.id, 'Source');
    const card = await createLessonCard(course.id, source.id, 'front_back', 'q', 'a');

    const [first, second] = await Promise.all([
      linkCardToLesson(target.id, card.id),
      linkCardToLesson(target.id, card.id),
    ]);

    expect(first.id).toBe(second.id);
    expect(await db.lessonCards.count()).toBe(1);
  });
});

describe('reorderLessons', () => {
  beforeEach(reset);

  it('reassigns orderIndex by array position', async () => {
    const course = await createCourse('Reorder test');
    const l1 = await createLesson(course.id, 'L1'); // orderIndex 0
    const l2 = await createLesson(course.id, 'L2'); // orderIndex 1
    const l3 = await createLesson(course.id, 'L3'); // orderIndex 2

    // Reverse the order.
    await reorderLessons(course.id, [l3.id, l2.id, l1.id]);

    const updated = await db.lessons.where('courseId').equals(course.id).sortBy('orderIndex');
    expect(updated[0].id).toBe(l3.id);
    expect(updated[0].orderIndex).toBe(0);
    expect(updated[1].id).toBe(l2.id);
    expect(updated[1].orderIndex).toBe(1);
    expect(updated[2].id).toBe(l1.id);
    expect(updated[2].orderIndex).toBe(2);
  });
});

describe('listNotes ordering', () => {
  beforeEach(reset);

  it('returns notes in orderIndex ascending order', async () => {
    const course = await createCourse('Notes test');
    const lesson = await createLesson(course.id, 'L1');
    const n1 = await createNote(lesson.id, 'Note 1');
    const n2 = await createNote(lesson.id, 'Note 2');
    const n3 = await createNote(lesson.id, 'Note 3');

    const notes = await listNotes(lesson.id);
    expect(notes.map((n) => n.id)).toEqual([n1.id, n2.id, n3.id]);
  });
});

describe('course assessment repository', () => {
  beforeEach(reset);

  it('stores checkpoints that can be ordered by examDate', async () => {
    const course = await createCourse('Assessments test');
    const t1 = Date.now() + 10 * 86400000;
    const t2 = Date.now() + 30 * 86400000;
    const t3 = Date.now() + 5 * 86400000;
    const d1 = await createCourseAssessment(course.id, 'Late', t1);
    const d2 = await createCourseAssessment(course.id, 'Later', t2);
    const d3 = await createCourseAssessment(course.id, 'Soon', t3);

    const dates = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .filter((assessment) => assessment.kind === 'checkpoint')
      .sortBy('examDate');
    expect(dates.map((d) => d.id)).toEqual([d3.id, d1.id, d2.id]);
  });

  it('defaults checkpoints to explicit prefix coverage', async () => {
    const course = await createCourse('Assessments test');
    const checkpoint = await createCourseAssessment(course.id, 'Mock', Date.now() + 86_400_000);

    expect(checkpoint).toMatchObject({
      kind: 'checkpoint',
      afterLessonId: null,
      coverageMode: 'prefix',
      excludedCardIds: [],
    });
    expect(checkpoint).not.toHaveProperty('lessonIds');
  });

  it('stores independent custom coverage, placement and exclusions', async () => {
    const course = await createCourse('Assessments test');
    const lesson1 = await createLesson(course.id, 'L1');
    const lesson2 = await createLesson(course.id, 'L2');
    const card = await createLessonCard(course.id, lesson1.id, 'front_back', 'q', 'a');
    const checkpoint = await createCourseAssessment(course.id, 'Mock', Date.now() + 86_400_000, {
      afterLessonId: lesson2.id,
      coverageMode: 'custom',
      lessonIds: [lesson1.id],
      excludedCardIds: [card.id],
    });

    expect(checkpoint).toMatchObject({
      afterLessonId: lesson2.id,
      coverageMode: 'custom',
      lessonIds: [lesson1.id],
      excludedCardIds: [card.id],
    });
  });

  it('infers compatible placement without conflating it with coverage', async () => {
    const course = await createCourse('Assessments test');
    const lesson1 = await createLesson(course.id, 'L1');
    const lesson2 = await createLesson(course.id, 'L2');
    const lesson3 = await createLesson(course.id, 'L3');

    const prefix = await createCourseAssessment(course.id, 'Prefix', Date.now() + 86_400_000);
    const custom = await createCourseAssessment(course.id, 'Custom', Date.now() + 172_800_000, {
      coverageMode: 'custom',
      lessonIds: [lesson1.id, lesson2.id],
    });

    expect(prefix).toMatchObject({ coverageMode: 'prefix', afterLessonId: lesson3.id });
    expect(custom).toMatchObject({
      coverageMode: 'custom',
      lessonIds: [lesson1.id, lesson2.id],
      afterLessonId: lesson2.id,
    });
  });

  it('rejects structurally ambiguous or duplicate coverage', async () => {
    const course = await createCourse('Assessments test');

    await expect(
      createCourseAssessment(course.id, 'Bad prefix', Date.now(), {
        coverageMode: 'prefix',
        lessonIds: ['lesson-1'],
      } as never),
    ).rejects.toThrow('Prefix assessment coverage cannot store lesson ids');
    await expect(
      createCourseAssessment(course.id, 'Empty custom', Date.now(), {
        coverageMode: 'custom',
        lessonIds: [],
      }),
    ).rejects.toThrow('requires an explicit lesson-id array');
    await expect(
      createCourseAssessment(course.id, 'Duplicate custom', Date.now(), {
        coverageMode: 'custom',
        lessonIds: ['lesson-1', 'lesson-1'],
      }),
    ).rejects.toThrow('cannot contain duplicate lesson ids');
  });

  it('rejects missing, cross-course and future lesson references', async () => {
    const course = await createCourse('Assessment validation');
    const otherCourse = await createCourse('Other course');
    const first = await createLesson(course.id, 'First');
    const second = await createLesson(course.id, 'Second');
    const foreign = await createLesson(otherCourse.id, 'Foreign');

    await expect(
      createCourseAssessment(course.id, 'Missing anchor', Date.now(), {
        afterLessonId: 'missing',
      }),
    ).rejects.toThrow('placement lesson missing could not be found');
    await expect(
      createCourseAssessment(course.id, 'Foreign lesson', Date.now(), {
        afterLessonId: first.id,
        coverageMode: 'custom',
        lessonIds: [foreign.id],
      }),
    ).rejects.toThrow('belongs to another course');
    await expect(
      createCourseAssessment(course.id, 'Future lesson', Date.now(), {
        afterLessonId: first.id,
        coverageMode: 'custom',
        lessonIds: [second.id],
      }),
    ).rejects.toThrow('positioned after the assessment');
  });

  it('rejects exclusions that do not resolve to covered cards', async () => {
    const course = await createCourse('Assessment exclusions');
    const first = await createLesson(course.id, 'First');
    const second = await createLesson(course.id, 'Second');
    const uncovered = await createLessonCard(course.id, second.id, 'front_back', 'q', 'a');

    await expect(
      createCourseAssessment(course.id, 'Invalid exclusion', Date.now(), {
        afterLessonId: first.id,
        excludedCardIds: [uncovered.id],
      }),
    ).rejects.toThrow('is not covered by the assessment');
  });

  it('preserves exactly one final assessment', async () => {
    const course = await createCourse('Assessments test');
    const final = (await db.courseAssessments.where('courseId').equals(course.id).toArray()).find(
      (assessment) => assessment.kind === 'final',
    )!;
    const checkpoint = await createCourseAssessment(course.id, 'Mock', Date.now() + 86_400_000);

    await expect(
      createCourseAssessment(course.id, 'Second final', Date.now() + 172_800_000, {
        kind: 'final',
      }),
    ).rejects.toThrow('exactly one final assessment');
    await expect(updateCourseAssessment(final.id, { kind: 'checkpoint' })).rejects.toThrow(
      'cannot be demoted',
    );
    await expect(updateCourseAssessment(checkpoint.id, { kind: 'final' })).rejects.toThrow(
      'exactly one final assessment',
    );
    await expect(deleteCourseAssessment(final.id)).rejects.toThrow('cannot be deleted');

    const assessments = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    expect(assessments.filter((assessment) => assessment.kind === 'final')).toEqual([final]);
    expect(assessments.filter((assessment) => assessment.kind === 'checkpoint')).toEqual([
      checkpoint,
    ]);
  });

  it('allows deleting a checkpoint without touching the final', async () => {
    const course = await createCourse('Assessments test');
    const checkpoint = await createCourseAssessment(course.id, 'Mock', Date.now() + 86_400_000);
    const plan = await createOrResumeRevisionPlan(checkpoint.id, 20, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });

    await deleteCourseAssessment(checkpoint.id);

    const remaining = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].kind).toBe('final');
    expect(await db.revisionPlans.get(plan.id)).toBeUndefined();
  });
});

describe('listPracticeNodes', () => {
  beforeEach(reset);

  it('returns only nodes belonging to the given course', async () => {
    const c1 = await createCourse('Course 1');
    const c2 = await createCourse('Course 2');
    await createPracticeNode(c1.id, { type: 'auto', name: 'P1' });
    await createPracticeNode(c2.id, { type: 'manual', name: 'P2' });

    const nodes1 = await db.practiceNodes.where('courseId').equals(c1.id).toArray();
    const nodes2 = await db.practiceNodes.where('courseId').equals(c2.id).toArray();
    expect(nodes1).toHaveLength(1);
    expect(nodes1[0].name).toBe('P1');
    expect(nodes2).toHaveLength(1);
    expect(nodes2[0].name).toBe('P2');
  });
});

describe('createCard opts', () => {
  beforeEach(reset);

  it('stamps courseId and primaryLessonId when opts are provided', async () => {
    const deck = await createDeck('Test deck');
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'L1');

    const card = await createCard(deck.id, 'front_back', 'q', 'a', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });

    expect(card.courseId).toBe(course.id);
    expect(card.primaryLessonId).toBe(lesson.id);
  });

  it('leaves courseId and primaryLessonId undefined when opts are omitted', async () => {
    const deck = await createDeck('Test deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');

    expect(card.courseId).toBeUndefined();
    expect(card.primaryLessonId).toBeUndefined();
  });
});

describe('ensureLessonDeck', () => {
  beforeEach(reset);

  it('creates a backing deck and userPerformance row for a new lesson', async () => {
    const course = await createCourse('Course', { examObjective: 'securedTopics' });
    const lesson = await createLesson(course.id, 'Lesson 1');

    const deckId = await ensureLessonDeck(course.id, lesson.id);

    const deck = await db.decks.get(deckId);
    expect(deck).toBeDefined();
    expect(deck?.name).toBe('Lesson 1');
    expect(deck?.examDate).toBe(course.examDate);
    expect(deck?.fsrsVersion).toBe(course.fsrsVersion);
    expect(deck?.examObjective).toBe('securedTopics');
    expect(await db.userPerformance.get(deckId)).toBeDefined();
  });

  it('reuses the existing backing deck on a second call for the same lesson', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const deckId = await ensureLessonDeck(course.id, lesson.id);
    // Simulate a card already living in this lesson's deck, as createLessonCard would leave behind.
    await createCard(deckId, 'front_back', 'q', 'a', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });

    const deckIdAgain = await ensureLessonDeck(course.id, lesson.id);

    expect(deckIdAgain).toBe(deckId);
    expect(await db.decks.count()).toBe(1);
  });
});

describe('createLessonCard', () => {
  beforeEach(reset);

  it('creates a card visible via primaryLessonId and backed by a real deck', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

    expect(card.courseId).toBe(course.id);
    expect(card.primaryLessonId).toBe(lesson.id);
    expect(await db.decks.get(card.deckId)).toBeDefined();

    const lessonCards = await db.cards.where('primaryLessonId').equals(lesson.id).toArray();
    expect(lessonCards.map((c) => c.id)).toEqual([card.id]);
  });

  it('reuses the same backing deck for a second card in the same lesson', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const first = await createLessonCard(course.id, lesson.id, 'front_back', 'q1', 'a1');
    const second = await createLessonCard(course.id, lesson.id, 'front_back', 'q2', 'a2');

    expect(second.deckId).toBe(first.deckId);
    expect(await db.decks.count()).toBe(1);
  });

  it('createLessonCardWithReverse stamps courseId/primaryLessonId on both cards', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const { card, reverse } = await createLessonCardWithReverse(course.id, lesson.id, 'q', 'a');

    for (const c of [card, reverse]) {
      expect(c.courseId).toBe(course.id);
      expect(c.primaryLessonId).toBe(lesson.id);
    }
  });

  it('createLessonBasicReversedPair stamps courseId/primaryLessonId on both cards', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const { card, reverse } = await createLessonBasicReversedPair(course.id, lesson.id, 'q', 'a');

    for (const c of [card, reverse]) {
      expect(c.courseId).toBe(course.id);
      expect(c.primaryLessonId).toBe(lesson.id);
    }
    expect(card.reverseCardId).toBe(reverse.id);
    expect(reverse.reverseCardId).toBe(card.id);
  });
});

describe('createCardWithReverse / createBasicReversedPair without opts', () => {
  beforeEach(reset);

  it('leave courseId/primaryLessonId undefined on both cards when opts are omitted', async () => {
    const deck = await createDeck('Test deck');

    const { card, reverse } = await createCardWithReverse(deck.id, 'q', 'a');
    expect(card.courseId).toBeUndefined();
    expect(reverse.courseId).toBeUndefined();

    const { card: card2, reverse: reverse2 } = await createBasicReversedPair(deck.id, 'q2', 'a2');
    expect(card2.courseId).toBeUndefined();
    expect(reverse2.courseId).toBeUndefined();
  });
});

describe('ensureCourseBankDeck', () => {
  beforeEach(reset);

  it('creates a backing deck and userPerformance row for a course with no unassigned cards yet', async () => {
    const course = await createCourse('Course', { examObjective: 'securedTopics' });

    const deckId = await ensureCourseBankDeck(course.id);

    const deck = await db.decks.get(deckId);
    expect(deck).toBeDefined();
    expect(deck?.name).toBe('Course — Question bank');
    expect(deck?.examDate).toBe(course.examDate);
    expect(deck?.examObjective).toBe('securedTopics');
    expect(await db.userPerformance.get(deckId)).toBeDefined();
  });

  it('reuses the existing bank deck on a second call, ignoring lesson-assigned cards', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

    const deckId = await ensureCourseBankDeck(course.id);
    await createCard(deckId, 'front_back', 'q2', 'a2', [], {
      courseId: course.id,
      primaryLessonId: null,
    });

    const deckIdAgain = await ensureCourseBankDeck(course.id);

    expect(deckIdAgain).toBe(deckId);
    // One lesson deck plus one bank deck.
    expect(await db.decks.count()).toBe(2);
  });
});

describe('createCourseCard', () => {
  beforeEach(reset);

  it('creates a card with courseId set and primaryLessonId null, backed by a real deck', async () => {
    const course = await createCourse('Course');

    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');

    expect(card.courseId).toBe(course.id);
    expect(card.primaryLessonId).toBeNull();
    expect(await db.decks.get(card.deckId)).toBeDefined();
  });

  it('reuses the same bank deck for a second unassigned card', async () => {
    const course = await createCourse('Course');

    const first = await createCourseCard(course.id, 'front_back', 'q1', 'a1');
    const second = await createCourseCard(course.id, 'front_back', 'q2', 'a2');

    expect(second.deckId).toBe(first.deckId);
    expect(await db.decks.count()).toBe(1);
  });

  it('createCourseCardWithReverse and createCourseBasicReversedPair stamp courseId with a null primaryLessonId', async () => {
    const course = await createCourse('Course');

    const { card, reverse } = await createCourseCardWithReverse(course.id, 'q', 'a');
    for (const c of [card, reverse]) {
      expect(c.courseId).toBe(course.id);
      expect(c.primaryLessonId).toBeNull();
    }

    const pair = await createCourseBasicReversedPair(course.id, 'q2', 'a2');
    expect(pair.card.primaryLessonId).toBeNull();
    expect(pair.reverse.primaryLessonId).toBeNull();
    expect(pair.card.reverseCardId).toBe(pair.reverse.id);
  });
});

describe('assignCardsToLesson', () => {
  beforeEach(reset);

  it('moves unassigned cards into a lesson and updates deckId to match', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');
    const bankDeckId = card.deckId;

    await assignCardsToLesson([card.id], course.id, lesson.id);

    const updated = await db.cards.get(card.id);
    expect(updated?.primaryLessonId).toBe(lesson.id);
    expect(updated?.deckId).not.toBe(bankDeckId);
    expect(updated?.deckId).toBe(await ensureLessonDeck(course.id, lesson.id));
  });

  it('unassigns a lesson card back to the course bank deck when lessonId is null', async () => {
    const course = await createCourse('Course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

    await assignCardsToLesson([card.id], course.id, null);

    const updated = await db.cards.get(card.id);
    expect(updated?.primaryLessonId).toBeNull();
    expect(updated?.deckId).toBe(await ensureCourseBankDeck(course.id));
  });

  it('reassigns multiple cards from different lessons to the same target lesson', async () => {
    const course = await createCourse('Course');
    const lessonA = await createLesson(course.id, 'Lesson A');
    const lessonB = await createLesson(course.id, 'Lesson B');
    const cardA = await createLessonCard(course.id, lessonA.id, 'front_back', 'qa', 'aa');
    const cardB = await createLessonCard(course.id, lessonB.id, 'front_back', 'qb', 'ab');

    await assignCardsToLesson([cardA.id, cardB.id], course.id, lessonB.id);

    const [updatedA, updatedB] = await Promise.all([
      db.cards.get(cardA.id),
      db.cards.get(cardB.id),
    ]);
    expect(updatedA?.primaryLessonId).toBe(lessonB.id);
    expect(updatedB?.primaryLessonId).toBe(lessonB.id);
    expect(updatedA?.deckId).toBe(updatedB?.deckId);
  });
});

describe('publishCourse', () => {
  beforeEach(reset);

  it('creates a fresh lineage id and revision 1 on first publish', async () => {
    const course = await createCourse('Publish test');
    expect(course.distribution).toBeUndefined();
    const before = Date.now();

    const distribution = await publishCourse(course.id);

    expect(typeof distribution.lineageId).toBe('string');
    expect(distribution.lineageId.length).toBeGreaterThan(0);
    expect(distribution.revision).toBe(1);
    expect(distribution.publishedAt).toBeGreaterThanOrEqual(before);
    expect(await db.courses.get(course.id)).toMatchObject({ distribution });
  });

  it('keeps the same lineage id and increments revision on republish', async () => {
    const course = await createCourse('Republish test');
    const first = await publishCourse(course.id);

    const second = await publishCourse(course.id);
    const third = await publishCourse(course.id);

    expect(second.lineageId).toBe(first.lineageId);
    expect(second.revision).toBe(2);
    expect(second.publishedAt).toBeGreaterThanOrEqual(first.publishedAt);
    expect(third.lineageId).toBe(first.lineageId);
    expect(third.revision).toBe(3);
    expect(await db.courses.get(course.id)).toMatchObject({ distribution: third });
  });

  it('rejects publishing a course that does not exist', async () => {
    await expect(publishCourse('missing')).rejects.toThrow('could not be found');
  });
});

describe('detachCourse', () => {
  beforeEach(reset);

  it('clears distributedCopy, the lineage mapping and any pending review, leaving content untouched', async () => {
    const course = await createCourse('Detach test');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const lineageId = 'lineage-detach-1';
    await updateCourse(course.id, {
      distributedCopy: {
        lineageId,
        revision: 2,
        locked: true,
        autoAcceptUpdates: false,
      },
    });
    await db.lineageIdMappings.put({
      id: lineageId,
      courseId: course.id,
      lessonIds: [lesson.id],
      noteIds: [],
      cardIds: [],
      sequenceIds: [],
      lessonSnapshots: {},
      noteSnapshots: {},
      cardSnapshots: {},
    });
    await db.pendingMergeReviews.put({
      id: 'review-1',
      courseId: course.id,
      lineageId,
      revision: 2,
      diff: {
        creates: { lessons: [], notes: [], cards: [] },
        updates: { lessons: [], notes: [], cards: [] },
        removals: { lessonIds: [], noteIds: [], cardIds: [] },
        conflicts: [],
      },
      createdAt: Date.now(),
    });

    await detachCourse(course.id);

    const updated = await db.courses.get(course.id);
    expect(updated?.distributedCopy).toBeUndefined();
    expect(await db.lineageIdMappings.get(lineageId)).toBeUndefined();
    expect(await db.pendingMergeReviews.where('courseId').equals(course.id).toArray()).toEqual(
      [],
    );
    // Lesson content itself is untouched by detach.
    expect(await db.lessons.get(lesson.id)).toBeDefined();
  });

  it('is a no-op on lineage/review tables for a course with no distributedCopy', async () => {
    const course = await createCourse('Undistributed detach');
    await expect(detachCourse(course.id)).resolves.toBeUndefined();
    expect((await db.courses.get(course.id))?.distributedCopy).toBeUndefined();
  });

  it('rejects detaching a course that does not exist', async () => {
    await expect(detachCourse('missing')).rejects.toThrow('could not be found');
  });
});

describe('stampMissingLessonViewModes', () => {
  beforeEach(reset);

  it('stamps courses with no explicit mode using the retired global default', async () => {
    localStorage.setItem('lacuna.lessonViewMode', 'edit');
    const unstamped = await createCourse('Unstamped');
    await db.courses.update(unstamped.id, { lessonViewMode: undefined });

    await stampMissingLessonViewModes();

    const updated = await db.courses.get(unstamped.id);
    expect(updated?.lessonViewMode).toBe('edit');
  });

  it('leaves courses that already have an explicit mode untouched', async () => {
    localStorage.setItem('lacuna.lessonViewMode', 'edit');
    const alreadyStudy = await createCourse('Already study');
    await db.courses.update(alreadyStudy.id, { lessonViewMode: 'study' });

    await stampMissingLessonViewModes();

    const updated = await db.courses.get(alreadyStudy.id);
    expect(updated?.lessonViewMode).toBe('study');
  });
});
