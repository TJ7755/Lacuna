import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { createCourse } from '../db/courseRepository';
import { createLesson, reorderLessons } from '../db/lessonRepository';
import { db } from '../db/schema';
import { buildPath } from './path';

beforeEach(async () => {
  await db.delete();
  await db.open();
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
  expect(buildPath(local, [a, b], assessments, new Map()).map((node) => node.id)).toEqual([b.id, a.id]);
  expect([a.orderIndex, b.orderIndex]).toEqual([0, 1]);
});

it('rejects stored-content reordering on a locked distributed copy', async () => {
  const course = await createCourse('Science', {
    distributedCopy: { lineageId: 'science', revision: 1, locked: true, autoAcceptUpdates: false },
  });
  const a = await createLesson(course.id, 'A');
  const b = await createLesson(course.id, 'B');
  await expect(reorderLessons(course.id, [b.id, a.id])).rejects.toThrow(/locked/i);
  expect(await db.lessons.toArray()).toEqual([a, b].sort((left, right) => left.id.localeCompare(right.id)));
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
  expect(result.map((lesson) => lesson.id)).toEqual(['B', 'C', 'A']);
  expect(result[0]).toBe(b);
  expect(result[1]).toBe(c);
  expect(source).toEqual(before);
});

it('keeps full-course coverage, exam targeting and lesson-anchored Question Sets intact', async () => {
  const { resolveAssessmentCoverage } = await import('./assessmentCoverage');
  const { createLessonCard } = await import('../db/cardRepository');
  const { makeExamDateContext, resolveCardExamDate } = await import('../fsrs/examDate');
  const course = await createCourse('Science', { autoPractice: false,
    distributedCopy: { lineageId: 'science', revision: 1, locked: true, autoAcceptUpdates: false } });
  const a = await createLesson(course.id, 'A');
  const b = await createLesson(course.id, 'B', { description: 'Prerequisites: A' });
  const cards = [await createLessonCard(course.id, a.id, 'front_back', 'A', 'A'), await createLessonCard(course.id, b.id, 'front_back', 'B', 'B')];
  const assessments = await db.courseAssessments.toArray();
  const activity = { id: 'activity', courseId: course.id, type: 'question-set' as const,
    questionSetId: 'set', afterLessonId: b.id, name: 'Practice Qs', createdAt: 1, updatedAt: 1 };
  const local = { ...course, localLessonOrder: [b.id, a.id] };
  const nodes = buildPath(local, [a, b], assessments, new Map(), [activity]);
  expect(nodes.map((node) => node.id)).toEqual([b.id, activity.id, a.id]);
  expect(nodes[0]).toMatchObject({ status: 'available', lesson: b });
  expect(resolveAssessmentCoverage(assessments[0], [a, b], cards, []).cards.map((card) => card.id)).toEqual(cards.map((card) => card.id));
  const context = makeExamDateContext(local, [a, b], assessments);
  expect(cards.map((card) => resolveCardExamDate(card, context))).toEqual([course.examDate, course.examDate]);
});

it('suspends unsupported shapes without changing their unlock or practice obligations', async () => {
  const { localLessonOrderUnavailableReason } = await import('./lessonOrder');
  const course = await createCourse('Science', { autoPractice: false,
    distributedCopy: { lineageId: 'science', revision: 1, locked: true, autoAcceptUpdates: false } });
  const a = await createLesson(course.id, 'A');
  const b = await createLesson(course.id, 'B');
  const lessons = [a, b];
  const assessments = await db.courseAssessments.toArray();
  const manual = { id: 'practice', courseId: course.id, type: 'manual' as const, position: 0, name: 'Cards', createdAt: 1, updatedAt: 1 };
  const variants = [
    { course: { ...course, archived: true }, assessments, practice: [] },
    { course: { ...course, autoPractice: true }, assessments, practice: [] },
    { course: { ...course, unlockMode: 'linear' as const, linearCadence: { anchorDate: Date.now() + 86_400_000, intervalDays: 1 } }, assessments, practice: [] },
    { course: { ...course, unlockMode: 'semi-linear' as const }, assessments, practice: [] },
    { course, assessments, practice: [manual] },
    { course, assessments: [...assessments, { ...assessments[0], id: 'checkpoint', kind: 'checkpoint' as const, afterLessonId: a.id }], practice: [] },
    { course, assessments: [{ ...assessments[0], afterLessonId: a.id }], practice: [] },
    { course, assessments: [{ ...assessments[0], coverageMode: 'custom' as const, lessonIds: [a.id] }], practice: [] },
    { course, assessments: [{ ...assessments[0], excludedCardIds: ['excluded'] }], practice: [] },
    { course, assessments: [{ ...assessments[0], needsAuthorConfirmation: true }], practice: [] },
    { course, assessments, practice: [{ ...manual, type: 'question-set' as const, questionSetId: 'set', afterLessonId: 'missing' }] },
    { course, assessments: [], practice: [] },
  ];
  for (const variant of variants) {
    expect(localLessonOrderUnavailableReason(variant.course, lessons, variant.assessments, variant.practice)).toBeTruthy();
    expect(buildPath({ ...variant.course, localLessonOrder: [b.id, a.id] }, lessons, variant.assessments, new Map(), variant.practice))
      .toEqual(buildPath(variant.course, lessons, variant.assessments, new Map(), variant.practice));
  }
});
