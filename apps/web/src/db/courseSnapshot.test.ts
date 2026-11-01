import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  createNote,
  createPracticeNode,
  deleteCourse,
  createCourseCard,
  createSequence,
  linkCardToLesson,
  recordReview,
  restoreCourse,
  snapshotCourse,
} from './repository';
import { createOrResumeRevisionPlan } from './revisionPlanRepository';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { reviewHistoryEntryIdForEvent } from '@lacuna/core/db/reviewHistory';
import { performanceForCourseBackingDecks, performanceForReviewUnit } from './backingDecks';
import { createConcept, createFixedQuestion, startQuestionAttempt } from '../questions/repository';
import { reset, waitForSessionHistory } from './courseRepository.testFixtures';

describe('snapshotCourse / restoreCourse', () => {
  beforeEach(reset);

  it('returns null for a course that does not exist', async () => {
    expect(await snapshotCourse('missing')).toBeNull();
  });

  it('restores Concepts, Questions and immutable attempts', async () => {
    const course = await createCourse('Question snapshot');
    const concept = await createConcept(course.id, 'Factor quadratics');
    const question = await createFixedQuestion({
      courseId: course.id,
      name: 'Factorisation',
      prompt: 'Factor $x^2 + 3x + 2$.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
      explanation: 'Find two integers with product 2 and sum 3.',
      targetConceptId: concept.id,
    });
    const attempt = await startQuestionAttempt({
      questionId: question.id,
      sessionId: 'question-snapshot-session',
    });
    const snapshot = await snapshotCourse(course.id);

    await deleteCourse(course.id);
    await restoreCourse(snapshot!);

    expect(await db.concepts.get(concept.id)).toEqual(concept);
    expect(await db.questions.get(question.id)).toEqual(question);
    expect(await db.questionAttempts.get(attempt.id)).toEqual(attempt);
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
    await waitForSessionHistory('event-course-snapshot');
    // Give a lesson some unlock state so restore fidelity can be asserted on it.
    const unlockedAt = Date.now();
    await db.lessons.update(lesson1.id, { unlockedAt });
    const cardBefore = await db.cards.get(lessonCard.id);
    expect(cardBefore!.stability).not.toBeNull();

    const snapshot = await snapshotCourse(course.id);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.cards).toHaveLength(3); // two ordinary cards + one sequence card
    expect(snapshot!.sessionHistory).toHaveLength(1);
    expect(snapshot!.sequences).toEqual([sequence]);
    expect(snapshot!.revisionPlans).toEqual([revisionPlan]);

    await deleteCourse(course.id);
    expect(await db.courses.get(course.id)).toBeUndefined();
    expect(await db.schedulingUnits.get(lessonCard.schedulingUnitId)).toBeUndefined();
    expect(await db.schedulingUnits.get(bankCard.schedulingUnitId)).toBeUndefined();

    await restoreCourse(snapshot!);

    expect(await db.courses.get(course.id)).toBeDefined();
    expect(await db.lessons.where('courseId').equals(course.id).count()).toBe(2);
    expect(await db.notes.where('lessonId').equals(lesson1.id).count()).toBe(1);
    expect(await db.noteAnnotations.get('course-annotation-1')).toBeDefined();
    expect(await db.lessonCards.where('lessonId').equals(lesson2.id).count()).toBe(1);
    expect(await db.practiceNodes.where('courseId').equals(course.id).count()).toBe(1);
    expect(await db.courseAssessments.where('courseId').equals(course.id).count()).toBe(2);
    expect(await db.cards.where('courseId').equals(course.id).count()).toBe(3);
    expect(await db.schedulingUnits.get(lessonCard.schedulingUnitId)).toBeDefined();
    expect(await db.schedulingUnits.get(bankCard.schedulingUnitId)).toBeDefined();
    expect(await db.schedulingPerformance.get(lessonCard.schedulingUnitId)).toBeDefined();
    expect(await db.coursePerformance.get(course.id)).toBeDefined();
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

  it('replaces canonical history when a course snapshot omits later events', async () => {
    const course = await createCourse('Course snapshot history boundary');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    await recordReview({
      card,
      eventId: 'event-course-snapshot-history-boundary',
      sessionId: 'session-course-snapshot-history-boundary',
      sessionKind: 'lesson',
      deck: course,
      kind: 'course',
      grade: 3,
      responseTimeSec: 1,
      distracted: false,
      correct: true,
    });

    const snapshot = await snapshotCourse(course.id);
    const laterReview = {
      ...snapshot!.reviewHistory[0],
      id: reviewHistoryEntryIdForEvent('event-after-course-snapshot'),
      eventId: 'event-after-course-snapshot',
      timestamp: snapshot!.reviewHistory[0].timestamp + 1,
    };
    snapshot!.reviewHistory = [];
    await deleteCourse(course.id);
    await db.reviewHistory.add(laterReview);
    await restoreCourse(snapshot!);

    const restored = (await db.cards.get(card.id))!;
    expect(restored.history).toEqual([]);
    expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(0);
    expect((await hydrateCardsWithHistory([restored]))[0].history).toEqual([]);
  });

  it('does not partially restore either key space when snapshot validation rejects', async () => {
    const course = await createCourse('Invalid snapshot');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const backing = {
      deckId: card.deckId!,
      runningMeanResponseTime: 31,
      runningStdDevResponseTime: 2,
      m2: 8,
      totalCorrectReviews: 6,
    };
    const calibration = {
      deckId: course.id,
      runningMeanResponseTime: 17,
      runningStdDevResponseTime: 3,
      m2: 12,
      totalCorrectReviews: 4,
    };
    await db.userPerformance.bulkPut([backing, calibration]);
    const snapshot = await snapshotCourse(course.id);
    await deleteCourse(course.id);

    const staleBacking = { ...backing, runningMeanResponseTime: 901 };
    const staleCalibration = { ...calibration, runningMeanResponseTime: 902 };
    await db.userPerformance.bulkPut([staleBacking, staleCalibration]);
    const invalidSnapshot = {
      ...snapshot!,
      courseAssessments: snapshot!.courseAssessments.map((assessment) => ({
        ...assessment,
        courseId: 'different-course',
      })),
    };

    await expect(restoreCourse(invalidSnapshot)).rejects.toThrow();

    expect(await db.courses.get(course.id)).toBeUndefined();
    expect(await db.userPerformance.get(card.deckId!)).toEqual(staleBacking);
    expect(await db.userPerformance.get(course.id)).toEqual(staleCalibration);
  });

  it('restores distinct pacing and calibration rows over stale values', async () => {
    const course = await createCourse('Key-space snapshot');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const lessonCard = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const bankCard = await createCourseCard(course.id, 'front_back', 'q2', 'a2');
    const backing = {
      schedulingUnitId: lessonCard.schedulingUnitId,
      courseId: course.id,
      lessonId: lesson.id,
      runningMeanResponseTime: 31,
      runningStdDevResponseTime: 2,
      m2: 8,
      totalCorrectReviews: 6,
      updatedAt: 0,
    };
    const calibration = {
      courseId: course.id,
      runningMeanResponseTime: 17,
      runningStdDevResponseTime: 3,
      m2: 12,
      totalCorrectReviews: 4,
      updatedAt: 0,
    };
    await db.schedulingPerformance.put(backing);
    await db.coursePerformance.put(calibration);

    const snapshot = await snapshotCourse(course.id);
    await deleteCourse(course.id);
    const staleBacking = { ...backing, runningMeanResponseTime: 901 };
    const staleCalibration = { ...calibration, runningMeanResponseTime: 902 };
    await db.schedulingPerformance.put(staleBacking);
    await db.coursePerformance.put(staleCalibration);

    await restoreCourse(snapshot!);

    expect(await db.schedulingPerformance.get(lessonCard.schedulingUnitId)).toEqual(backing);
    expect(await db.coursePerformance.get(course.id)).toEqual(calibration);
    const restoredLessonCard = (await db.cards.get(lessonCard.id))!;
    expect(
      (await performanceForCourseBackingDecks(course.id, [restoredLessonCard])).map(
        (row) => row.deckId,
      ),
    ).toEqual([lessonCard.schedulingUnitId]);
    expect(await performanceForReviewUnit(course.id, 'course')).toMatchObject({
      deckId: course.id,
    });
    expect(await performanceForReviewUnit(restoredLessonCard.schedulingUnitId!)).toMatchObject({
      deckId: restoredLessonCard.schedulingUnitId,
      schedulingUnitId: restoredLessonCard.schedulingUnitId,
    });
    expect(await db.cards.get(bankCard.id)).toBeDefined();
  });
});
