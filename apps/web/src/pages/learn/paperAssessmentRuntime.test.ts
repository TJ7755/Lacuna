import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from '../../db/schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createCourseAssessment,
  updateCourseAssessment,
  upsertLessonCardExposure,
  recordReview,
} from '../../db/repository';
import { getCourse, getCourseAssessmentDetails, listCardsForCourse } from '../../db/read';
import { createOrResumeRevisionPlan, refreshRevisionPlan } from '../../db/revisionPlanRepository';
import { assessmentPracticePool } from '../../course/assessmentPractice';
import { makeExamDateContext, resolveCardExamDate } from '../../fsrs/examDate';
import { finalExamNeedsDecision } from '../../state/finalExamLifecycle';
import {
  loadCourseSessionSource,
  loadGlobalSessionSource,
  prepareCourseSessionPool,
  resolveCourseSessionSelection,
} from './sessionPool';
import { makeSessionContext } from '../../fsrs/session';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../../specifications/paperFixture.testFixtures';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';

beforeEach(async () => {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
  localStorage.clear();
});

it('keeps paper scope, revision, selected targets and final lifecycle aligned without rewriting recall evidence', async () => {
  const now = Date.parse('2027-06-01T09:00:00Z');
  const course = await createCourse('Science', {
    specificationRef: paperSpecificationReference,
    specificationData: paperSpecification,
    examDate: now + 20 * MS_PER_DAY,
  });
  const lesson = await createLesson(course.id, 'Mixed topic');
  const cells = await createLessonCard(course.id, lesson.id, 'front_back', 'Cells?', 'Cell answer');
  const enzymes = await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    'Enzymes?',
    'Enzyme answer',
  );
  for (const [card, point] of [
    [cells, 'cells'],
    [enzymes, 'enzymes'],
  ] as const) {
    await db.concepts.update(card.conceptId, {
      specificationPointIds: [`example-science:${point}`],
    });
    await upsertLessonCardExposure(lesson.id, card.id, now - 31 * MS_PER_DAY);
    await recordReview({
      card,
      deck: course,
      kind: 'course',
      eventId: `review-${point}`,
      sessionId: 'previous-study',
      sessionKind: 'practice',
      grade: 3,
      responseTimeSec: 4,
      distracted: false,
      correct: true,
      now: now - 30 * MS_PER_DAY,
    });
  }
  const cardsBefore = await db.cards.toArray();
  const historyBefore = await db.reviewHistory.toArray();
  expect(historyBefore).toHaveLength(2);
  const final = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
  await updateCourseAssessment(final.id, {
    coverageMode: 'specification',
    specificationPaperId: 'paper-2',
    name: 'Second paper',
  });
  const first = await createCourseAssessment(course.id, 'First paper', now + 10 * MS_PER_DAY, {
    coverageMode: 'specification',
    specificationPaperId: 'paper-1',
    afterLessonId: null,
  });
  expect((await getCourseAssessmentDetails(first.id))?.cardIds).toEqual([cells.id]);
  expect((await getCourseAssessmentDetails(final.id))?.cardIds.sort()).toEqual(
    [cells.id, enzymes.id].sort(),
  );

  const projection = {
    projectionMode: 'fsrs-6-practice-fallback',
    memoryModelVersion: 'fsrs-6',
    fallbackReason: 'missing',
  } as const;
  const firstPlan = await createOrResumeRevisionPlan(first.id, 20, projection, now);
  const finalPlan = await createOrResumeRevisionPlan(final.id, 20, projection, now);
  expect(firstPlan.scope.eligibleCardIds).toEqual([cells.id]);
  expect(finalPlan.scope.eligibleCardIds).toEqual([cells.id, enzymes.id].sort());
  const cards = await listCardsForCourse(course.id);
  const concepts = await db.concepts.where('courseId').equals(course.id).toArray();
  const exposures = await db.lessonCardExposures.toArray();
  expect(
    assessmentPracticePool(first, {
      course,
      concepts,
      lessons: [lesson],
      cards,
      links: [],
      exposures,
      reachedLessonIds: new Set([lesson.id]),
      now,
    }).map((card) => card.id),
  ).toEqual([cells.id]);
  const datedCourse = (await getCourse(course.id))!;
  const assessments = await db.courseAssessments.where('courseId').equals(course.id).toArray();
  const ctx = makeExamDateContext(datedCourse, [lesson], assessments, [], concepts);
  expect(cards.map((card) => resolveCardExamDate(card, ctx, now))).toEqual(
    cards.map((card) => (card.id === cells.id ? first.examDate : datedCourse.examDate)),
  );
  const betweenPapers = first.examDate! + 1;
  expect(resolveCardExamDate(cells, ctx, betweenPapers)).toBe(datedCourse.examDate);
  expect(finalExamNeedsDecision(datedCourse, betweenPapers)).toBe(false);
  expect(finalExamNeedsDecision(datedCourse, datedCourse.examDate! + 1)).toBe(true);

  const request = {
    standaloneSimple: false,
    requestScopeLessonIds: undefined,
    practiceNodeKeyParam: null,
    requestAssessmentId: final.id,
    filterParams: [],
    examPractice: false,
    catchUpPractice: false,
  };
  const source = await loadCourseSessionSource(course.id, false);
  const selected = prepareCourseSessionPool(
    datedCourse,
    source,
    resolveCourseSessionSelection(datedCourse, source, request),
    request,
    finalPlan,
  );
  expect(resolveCardExamDate(cells, selected.examDateContext, now)).toBe(datedCourse.examDate);
  const globalSource = await loadGlobalSessionSource();
  const globalContext = makeSessionContext(globalSource.sessionUnits);
  const globalExamDates = globalContext.decks.get(cells.schedulingUnitId!)?.oc.examDateContext;
  expect(globalExamDates).toBeDefined();
  expect(resolveCardExamDate(cells, globalExamDates!, now)).toBe(first.examDate);

  await updateCourseAssessment(first.id, { examDate: first.examDate! + MS_PER_DAY });
  const moved = await refreshRevisionPlan(firstPlan.id, projection, now + 1);
  expect(moved.input.deadlineAt).toBe(first.examDate! + MS_PER_DAY);
  expect(moved.replans.at(-1)?.reasons).toContain('assessment-deadline-changed');
  await db.concepts.update(enzymes.conceptId, {
    specificationPointIds: ['example-science:enzymes', 'example-science:practical'],
  });
  const expanded = await refreshRevisionPlan(firstPlan.id, projection, now + 2);
  expect(expanded.scope.eligibleCardIds).toEqual([cells.id, enzymes.id].sort());
  expect(expanded.replans.at(-1)?.reasons).toContain('assessment-coverage-changed');
  expect(await db.cards.toArray()).toEqual(cardsBefore);
  expect(await db.reviewHistory.toArray()).toEqual(historyBefore);
});
