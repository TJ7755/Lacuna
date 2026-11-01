import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCard,
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  createNote,
  deleteLesson,
  createCourseCard,
  createSequence,
  linkCardToLesson,
  recordReview,
  restoreLesson,
  snapshotLesson,
  updateCourseAssessment,
} from './repository';
import { listLessons } from './read';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { reviewHistoryEntryIdForEvent } from '@lacuna/core/db/reviewHistory';
import { resolveAssessmentCoverage } from '../course/assessmentCoverage';
import { reset } from './courseRepository.testFixtures';

describe('deleteLesson', () => {
  beforeEach(reset);

  it('leaves all persisted state untouched when the lesson is missing', async () => {
    const course = await createCourse('Existing course');
    const lesson = await createLesson(course.id, 'Existing lesson');
    const before = await Promise.all(db.tables.map((table) => table.toArray()));

    expect(await snapshotLesson('missing')).toBeNull();
    await deleteLesson('missing');

    expect(await Promise.all(db.tables.map((table) => table.toArray()))).toEqual(before);
    expect(await db.lessons.get(lesson.id)).toEqual(lesson);
  });

  it('prunes exclusions that lose custom coverage and restores them on Undo', async () => {
    const course = await createCourse('Exclusion coverage');
    const first = await createLesson(course.id, 'First');
    const remaining = await createLesson(course.id, 'Remaining');
    const moved = await createLessonCard(course.id, first.id, 'front_back', 'Moved', 'Answer');
    const retained = await createLessonCard(
      course.id,
      remaining.id,
      'front_back',
      'Retained',
      'Answer',
    );
    const checkpoint = await createCourseAssessment(course.id, 'Checkpoint', Date.now() + 1, {
      afterLessonId: remaining.id,
      coverageMode: 'custom',
      lessonIds: [first.id, remaining.id],
      excludedCardIds: [moved.id, retained.id],
    });
    const snapshot = (await snapshotLesson(first.id))!;

    await deleteLesson(first.id);

    expect(await db.courseAssessments.get(checkpoint.id)).toMatchObject({
      lessonIds: [remaining.id],
      excludedCardIds: [retained.id],
      needsAuthorConfirmation: true,
    });
    expect(await db.cards.get(moved.id)).toMatchObject({ primaryLessonId: null });

    await restoreLesson(snapshot);

    expect(await db.courseAssessments.get(checkpoint.id)).toEqual(checkpoint);
    expect(await db.cards.get(moved.id)).toMatchObject({ primaryLessonId: first.id });
  });

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

    const deck = await createCourse('Test deck');
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
    const lessonDeckId = (await db.cards.where('sequenceItemId').equals('item').first())!
      .schedulingUnitId;

    await deleteLesson(lesson.id);

    const movedSequence = await db.sequences.get(sequence.id);
    const movedCard = await db.cards.where('sequenceItemId').equals('item').first();
    expect(movedSequence?.primaryLessonId).toBeNull();
    expect(movedCard?.primaryLessonId).toBeNull();
    expect(movedCard?.deckId).not.toBe(lessonDeckId);
    expect(await db.schedulingUnits.get(lessonDeckId)).toBeUndefined();
  });

  it('restores every row deleted or rewritten by a lesson deletion', async () => {
    const course = await createCourse('Lesson undo test');
    const lesson = await createLesson(course.id, 'L1');
    const note = await createNote(lesson.id, 'Note', 'Body');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const sequence = await createSequence(course.id, lesson.id, 'Sequence', [
      { id: 'item', value: 'Item' },
    ]);
    const deckId = card.schedulingUnitId;
    await db.noteAnnotations.add({
      id: 'annotation-1',
      noteId: note.id,
      startOffset: 0,
      endOffset: 4,
      selectedText: 'Body',
      createdAt: 1,
      updatedAt: 1,
    });
    await db.lessonCompletions.put({ lessonId: lesson.id, completedAt: 2, updatedAt: 2 });

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
      updatedAt: 2,
    });
    expect((await db.cards.get(card.id))?.primaryLessonId).toBe(lesson.id);
    expect((await db.sequences.get(sequence.id))?.primaryLessonId).toBe(lesson.id);
    expect(await db.schedulingUnits.get(deckId)).toBeDefined();
    expect(await db.schedulingPerformance.get(deckId)).toBeDefined();
  });

  it('replaces canonical history when a lesson snapshot omits later events', async () => {
    const course = await createCourse('Lesson snapshot history boundary');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    await recordReview({
      card,
      eventId: 'event-lesson-snapshot-history-boundary',
      sessionId: 'session-lesson-snapshot-history-boundary',
      sessionKind: 'lesson',
      deck: course,
      kind: 'course',
      grade: 3,
      responseTimeSec: 1,
      distracted: false,
      correct: true,
    });

    const snapshot = await snapshotLesson(lesson.id);
    const laterReview = {
      ...snapshot!.reviewHistory[0],
      id: reviewHistoryEntryIdForEvent('event-after-lesson-snapshot'),
      eventId: 'event-after-lesson-snapshot',
      timestamp: snapshot!.reviewHistory[0].timestamp + 1,
    };
    snapshot!.reviewHistory = [];
    await deleteLesson(lesson.id);
    await db.reviewHistory.add(laterReview);
    await restoreLesson(snapshot!);

    const restored = (await db.cards.get(card.id))!;
    expect(restored.history).toEqual([]);
    expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(0);
    expect((await hydrateCardsWithHistory([restored]))[0].history).toEqual([]);
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
