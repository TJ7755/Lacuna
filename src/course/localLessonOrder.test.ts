import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { createCourse, updateCourse } from '../db/courseRepository';
import { createLessonCard } from '../db/cardRepository';
import { createOrResumeRevisionPlan } from '../db/revisionPlanRepository';
import { makeExamDateContext } from '../fsrs/examDate';
import { assessmentPracticePool, currentAssessmentPracticeContext } from './assessmentPractice';
import { buildCourseStudyFlowSnapshot } from './studyFlowSnapshot';
import { planNextStudyStep } from './studyFlowPlanner';
import { earlierCourseLessonIds, earlierLessonIds } from './courseEntry';
import { createLesson, reorderLessons } from '../db/lessonRepository';
import { db } from '../db/schema';
import { buildPath } from './path';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('excludes optional extensions from prior knowledge in source and local order', async () => {
  const course = await createCourse('Science');
  const extension = await createLesson(course.id, 'Optional', { isExtension: true });
  const earlier = await createLesson(course.id, 'Earlier');
  const current = await createLesson(course.id, 'Current');
  const lessons = [extension, earlier, current];
  for (const order of [undefined, lessons.map((lesson) => lesson.id)]) {
    expect(earlierLessonIds(current.id, lessons, order)).toEqual(new Set([earlier.id]));
  }
});

it('traverses a locked copy in local order without rewriting publisher indices', async () => {
  const course = await createCourse('Science', {
    autoPractice: false,
    distributedCopy: { lineageId: 'science', revision: 1, locked: true, autoAcceptUpdates: false },
  });
  const a = await createLesson(course.id, 'A');
  const b = await createLesson(course.id, 'B');
  const local = { ...course, localLessonOrder: [b.id, a.id] };
  const assessments = await db.courseAssessments.toArray();
  expect(buildPath(local, [a, b], assessments, new Map()).map((node) => node.id)).toEqual([
    b.id,
    a.id,
  ]);
  expect([a.orderIndex, b.orderIndex]).toEqual([0, 1]);
});

it('uses the supported local entry prefix consistently without changing exam coverage', async () => {
  const course = await createCourse('Science', {
    autoPractice: false,
    distributedCopy: { lineageId: 'science', revision: 1, locked: true, autoAcceptUpdates: false },
  });
  const a = await createLesson(course.id, 'A');
  const b = await createLesson(course.id, 'B');
  const c = await createLesson(course.id, 'C');
  const lessons = [a, b, c];
  const cards = await Promise.all(
    lessons.map((lesson) =>
      createLessonCard(course.id, lesson.id, 'front_back', lesson.name, lesson.name),
    ),
  );
  const local = { ...course, localLessonOrder: [b.id, a.id, c.id], studyStartLessonId: a.id };
  await updateCourse(course.id, {
    localLessonOrder: local.localLessonOrder,
    studyStartLessonId: a.id,
  });
  const assessments = await db.courseAssessments.toArray();
  const nodes = buildPath(local, lessons, assessments, new Map());
  const snapshot = buildCourseStudyFlowSnapshot({
    course: local,
    nodes,
    cards,
    links: [],
    exposures: [],
    meanReviewSeconds: 20,
    examDateContext: makeExamDateContext(local, lessons, assessments),
  });
  expect(planNextStudyStep(snapshot)).toMatchObject({ kind: 'step', step: { lessonId: a.id } });
  expect(snapshot.catchUpEligibleCount).toBe(1);
  const context = { course: local, assessments, lessons, cards, links: [], exposures: [] };
  const current = currentAssessmentPracticeContext(context);
  expect(
    assessmentPracticePool(assessments[0], {
      ...context,
      reachedLessonIds: current.reachedLessonIds,
    }).map((card) => card.id),
  ).toEqual([cards[1].id]);
  const plan = await createOrResumeRevisionPlan(assessments[0].id, 20, {
    projectionMode: 'fsrs-6-practice-fallback',
    memoryModelVersion: 'fsrs-6',
    fallbackReason: 'missing',
  });
  expect(plan.scope.coveredLessonIds).toEqual([b.id, a.id, c.id]);
  expect(plan.scope.eligibleCardIds).toEqual([cards[1].id]);
  expect(lessons.map((lesson) => lesson.orderIndex)).toEqual([0, 1, 2]);
  expect(await db.lessonCardExposures.count()).toBe(0);
  expect(await db.lessonCompletions.count()).toBe(0);
  expect(
    earlierCourseLessonIds({ ...local, unlockMode: 'semi-linear' }, lessons, assessments, []),
  ).toEqual(new Set([b.id]));
});

it('rejects stored-content reordering on a locked distributed copy', async () => {
  const course = await createCourse('Science', {
    distributedCopy: { lineageId: 'science', revision: 1, locked: true, autoAcceptUpdates: false },
  });
  const a = await createLesson(course.id, 'A');
  const b = await createLesson(course.id, 'B');
  await expect(reorderLessons(course.id, [b.id, a.id])).rejects.toThrow(/locked/i);
  expect(await db.lessons.toArray()).toEqual(
    [a, b].sort((left, right) => left.id.localeCompare(right.id)),
  );
});

it('resolves tolerant stored preferences using canonical ties and original objects', async () => {
  const { resolveLessonOrder } = await import('./lessonOrder');
  const course = await createCourse('Science');
  const a = await createLesson(course.id, 'A', { id: 'A', orderIndex: 1, createdAt: 2 });
  const b = await createLesson(course.id, 'B', { id: 'B', orderIndex: 1, createdAt: 2 });
  const c = await createLesson(course.id, 'C', { id: 'C', orderIndex: 0, createdAt: 3 });
  const source = [b, a, c];
  const before = structuredClone(source);
  expect(resolveLessonOrder(source).map((lesson) => lesson.id)).toEqual(['C', 'A', 'B']);
  const result = resolveLessonOrder(source, ['B', 'removed', 'B', 'foreign']);
  expect(result.map((lesson) => lesson.id)).toEqual(['C', 'A', 'B']);
  expect(result[0]).toBe(c);
  expect(result[1]).toBe(a);
  expect(result[2]).toBe(b);
  expect(source).toEqual(before);
});

it('keeps full-course coverage, exam targeting and lesson-anchored Question Sets intact', async () => {
  const { resolveAssessmentCoverage } = await import('./assessmentCoverage');
  const { createLessonCard } = await import('../db/cardRepository');
  const { makeExamDateContext, resolveCardExamDate } = await import('../fsrs/examDate');
  const course = await createCourse('Science', {
    autoPractice: false,
    distributedCopy: { lineageId: 'science', revision: 1, locked: true, autoAcceptUpdates: false },
  });
  const a = await createLesson(course.id, 'A');
  const b = await createLesson(course.id, 'B', { description: 'Prerequisites: A' });
  const cards = [
    await createLessonCard(course.id, a.id, 'front_back', 'A', 'A'),
    await createLessonCard(course.id, b.id, 'front_back', 'B', 'B'),
  ];
  const assessments = await db.courseAssessments.toArray();
  const activity = {
    id: 'activity',
    courseId: course.id,
    type: 'question-set' as const,
    questionSetIds: ['third', 'first', 'second'],
    afterLessonId: b.id,
    name: 'Practice Qs',
    createdAt: 1,
    updatedAt: 1,
  };
  const local = { ...course, localLessonOrder: [b.id, a.id] };
  const nodes = buildPath(local, [a, b], assessments, new Map(), [activity]);
  expect(nodes.map((node) => node.id)).toEqual([b.id, activity.id, a.id]);
  expect(nodes[0]).toMatchObject({ status: 'available', lesson: b });
  expect(
    resolveAssessmentCoverage(assessments[0], [a, b], cards, []).cards.map((card) => card.id),
  ).toEqual(cards.map((card) => card.id));
  const context = makeExamDateContext(local, [a, b], assessments);
  expect(cards.map((card) => resolveCardExamDate(card, context))).toEqual([
    course.examDate,
    course.examDate,
  ]);
});

it('suspends local ordering only for archived or unlocked courses', async () => {
  const { localLessonOrderUnavailableReason } = await import('./lessonOrder');
  const course = await createCourse('Science', {
    distributedCopy: { lineageId: 'science', revision: 1, locked: true, autoAcceptUpdates: false },
  });
  const a = await createLesson(course.id, 'A');
  const b = await createLesson(course.id, 'B');
  const lessons = [a, b];
  const assessments = await db.courseAssessments.toArray();
  for (const changes of [{ archived: true }, { distributedCopy: undefined }]) {
    const suspended = { ...course, ...changes, localLessonOrder: [b.id, a.id] };
    expect(localLessonOrderUnavailableReason(suspended, lessons, assessments, [])).toBeTruthy();
    expect(
      buildPath(suspended, lessons, assessments, new Map())
        .filter((node) => node.nodeType === 'lesson')
        .map((node) => node.id),
    ).toEqual([a.id, b.id]);
  }
});
