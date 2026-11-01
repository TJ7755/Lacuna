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
  ensureLessonDeck,
  createCourseCard,
  createSequence,
  linkCardToLesson,
  recordReview,
} from './repository';
import { createOrResumeRevisionPlan } from './revisionPlanRepository';
import { createConcept, createFixedQuestion, startQuestionAttempt } from '../questions/repository';
import { reset, waitForSessionHistory } from './courseRepository.testFixtures';

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

  it('also removes scheduling units, session history and calibration profiles', async () => {
    const course = await createCourse('Cascade backing-deck test');
    const lesson = await createLesson(course.id, 'L1');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const deckId = card.schedulingUnitId;

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

    expect(await db.schedulingUnits.get(deckId)).toBeDefined();
    expect(await db.schedulingPerformance.get(deckId)).toBeDefined();
    expect(await db.coursePerformance.get(course.id)).toBeDefined();
    await waitForSessionHistory('event-delete-course');
    expect(await db.sessionHistory.where('deckId').equals(deckId).count()).toBe(1);

    await deleteCourse(course.id);

    expect(await db.schedulingUnits.get(deckId)).toBeUndefined();
    expect(await db.schedulingPerformance.get(deckId)).toBeUndefined();
    expect(await db.coursePerformance.get(course.id)).toBeUndefined();
    expect(await db.sessionHistory.where('deckId').equals(deckId).count()).toBe(0);
    expect(await db.sessionHistory.where('courseId').equals(course.id).count()).toBe(0);
  });

  it('removes only both performance key spaces owned by the deleted course', async () => {
    const course = await createCourse('Deleted course');
    const lesson = await createLesson(course.id, 'Deleted lesson');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const otherCourse = await createCourse('Retained course');
    const otherLesson = await createLesson(otherCourse.id, 'Retained lesson');
    const otherCard = await createLessonCard(
      otherCourse.id,
      otherLesson.id,
      'front_back',
      'q2',
      'a2',
    );
    const deletedBacking = {
      schedulingUnitId: card.schedulingUnitId,
      courseId: course.id,
      lessonId: lesson.id,
      runningMeanResponseTime: 21,
      runningStdDevResponseTime: 1,
      m2: 1,
      totalCorrectReviews: 5,
      updatedAt: 0,
    };
    const deletedCalibration = {
      courseId: course.id,
      runningMeanResponseTime: 22,
      runningStdDevResponseTime: 1,
      m2: 1,
      totalCorrectReviews: 6,
      updatedAt: 0,
    };
    const retainedBacking = {
      schedulingUnitId: otherCard.schedulingUnitId,
      courseId: otherCourse.id,
      lessonId: otherLesson.id,
      runningMeanResponseTime: 23,
      runningStdDevResponseTime: 1,
      m2: 1,
      totalCorrectReviews: 7,
      updatedAt: 0,
    };
    const retainedCalibration = {
      courseId: otherCourse.id,
      runningMeanResponseTime: 24,
      runningStdDevResponseTime: 1,
      m2: 1,
      totalCorrectReviews: 8,
      updatedAt: 0,
    };
    await db.schedulingPerformance.bulkPut([deletedBacking, retainedBacking]);
    await db.coursePerformance.bulkPut([deletedCalibration, retainedCalibration]);

    await deleteCourse(course.id);

    expect(await db.coursePerformance.get(course.id)).toBeUndefined();
    expect(await db.schedulingPerformance.get(card.schedulingUnitId)).toBeUndefined();
    expect(await db.coursePerformance.get(otherCourse.id)).toEqual(retainedCalibration);
    expect(await db.schedulingPerformance.get(otherCard.schedulingUnitId)).toEqual(retainedBacking);
  });

  it('removes empty owned backing decks and course sequences', async () => {
    const course = await createCourse('Empty ownership');
    const lesson = await createLesson(course.id, 'Lesson');
    const emptyDeckId = await ensureLessonDeck(course.id, lesson.id);
    await createSequence(course.id, lesson.id, 'Sequence', []);

    expect(await db.cards.where('courseId').equals(course.id).count()).toBe(0);
    expect(await db.schedulingUnits.get(emptyDeckId)).toBeDefined();
    expect(await db.sequences.where('courseId').equals(course.id).count()).toBe(1);

    await deleteCourse(course.id);

    expect(await db.schedulingUnits.get(emptyDeckId)).toBeUndefined();
    expect(await db.schedulingPerformance.get(emptyDeckId)).toBeUndefined();
    expect(await db.sequences.where('courseId').equals(course.id).count()).toBe(0);
  });

  it('removes Question evidence and distributed-course state owned by the Course', async () => {
    const course = await createCourse('Question cascade');
    const concept = await createConcept(course.id, 'Solve equations');
    const question = await createFixedQuestion({
      courseId: course.id,
      name: 'Equation',
      prompt: 'Solve $x + 1 = 2$.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
      explanation: 'Subtract one.',
      targetConceptId: concept.id,
    });
    const attempt = await startQuestionAttempt({
      questionId: question.id,
      sessionId: 'question-cascade-session',
    });

    await deleteCourse(course.id);

    expect(await db.concepts.get(concept.id)).toBeUndefined();
    expect(await db.questions.get(question.id)).toBeUndefined();
    expect(await db.questionConcepts.get(question.id)).toBeUndefined();
    expect(await db.questionAttempts.get(attempt.id)).toBeUndefined();
    expect(await db.tombstones.get(['questionAttempts', attempt.id])).toBeDefined();
  });
});
