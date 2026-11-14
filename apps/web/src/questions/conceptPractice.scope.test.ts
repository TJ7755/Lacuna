import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import {
  createCourse,
  createLesson,
  createCourseAssessment,
  updateCourseAssessment,
} from '../db/repository';
import { db } from '../db/schema';
import { listConceptPractice, startConceptPractice } from './conceptPractice';
import { saveQuestionSetResponseDraft } from './questionSetAttemptRepository';
import { createQuestionSet } from './questionSetRepository';
import { createConcept } from './repository';
import { listExamSkillPractice, startExamSkillPractice } from './examSkillPractice';
import { MS_PER_DAY } from '@lacuna/core/fsrs/params';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

it('does not resume a later-paper question from the same set as a nearer-paper question', async () => {
  const now = Date.now();
  const course = await createCourse('Mixed paper set', {
    specificationRef: paperSpecificationReference,
    specificationData: paperSpecification,
    examDate: now + 10 * MS_PER_DAY,
  });
  const cells = await createConcept(course.id, 'Cells');
  const enzymes = await createConcept(course.id, 'Enzymes');
  await db.concepts.update(cells.id, { specificationPointIds: ['example-science:cells'] });
  await db.concepts.update(enzymes.id, { specificationPointIds: ['example-science:enzymes'] });
  const final = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
  await updateCourseAssessment(final.id, {
    coverageMode: 'specification',
    specificationPaperId: 'paper-2',
  });
  const nearDate = now + MS_PER_DAY;
  await createCourseAssessment(course.id, 'First paper', nearDate, {
    coverageMode: 'specification',
    specificationPaperId: 'paper-1',
    afterLessonId: null,
  });
  await createQuestionSet({
    id: 'mixed',
    courseId: course.id,
    title: 'Both papers',
    lessonIds: [],
    assessmentIds: [],
    questions: [cells, enzymes].map((concept) => ({
      id: concept.id,
      prompt: `Apply ${concept.name}`,
      parts: [],
      answer: {
        maxMarks: 1,
        response: { kind: 'written' as const },
        prerequisiteConceptIds: [],
        allocations: [
          {
            id: `mark-${concept.id}`,
            criterion: 'Applies',
            maxMarks: 1,
            dimension: 'application' as const,
            targetConceptIds: [concept.id],
          },
        ],
      },
    })),
  });
  const later = await startConceptPractice(course.id, enzymes.id);
  expect(later.selection.questionId).toBe(enzymes.id);
  const next = await startConceptPractice(course.id, undefined, {
    mode: 'mixed',
    resume: true,
    scopeConceptIds: [cells.id, enzymes.id],
    study: { examDate: nearDate, scopeLessonIds: [] },
  });
  expect(next.selection.questionId).toBe(cells.id);
});

it.each([false, true])(
  'keeps a shared target on the selected exam instead of resuming a later draft (skill: %s)',
  async (skill) => {
    const now = Date.now();
    const course = await createCourse('Shared target');
    const concept = await createConcept(course.id, 'Shared concept');
    const near = await createLesson(course.id, 'Near');
    const later = await createLesson(course.id, 'Later');
    const nearDate = now + MS_PER_DAY;
    await db.lessons.update(near.id, { examDate: nearDate });
    await db.lessons.update(later.id, { examDate: now + 10 * MS_PER_DAY });
    for (const lesson of [later, near]) {
      await createQuestionSet({
        id: lesson.id,
        courseId: course.id,
        title: lesson.name,
        lessonIds: [lesson.id],
        assessmentIds: [],
        questions: [
          {
            id: `q-${lesson.id}`,
            prompt: `Apply ${lesson.name}`,
            parts: [],
            answer: {
              maxMarks: 1,
              response: { kind: 'written' },
              prerequisiteConceptIds: [],
              allocations: [
                {
                  id: 'mark',
                  criterion: 'Explains',
                  maxMarks: 1,
                  dimension: 'application',
                  targetConceptIds: [concept.id],
                  ...(skill
                    ? {
                        techniqueTags: {
                          taxonomyId: 'science-techniques',
                          taxonomyVersion: 1,
                          techniqueIds: ['graph-interpretation' as const],
                          provenance: { source: 'author' as const },
                        },
                      }
                    : {}),
                },
              ],
            },
          },
        ],
      });
    }
    const study = { scopeLessonIds: [near.id, later.id], examDate: now + 10 * MS_PER_DAY };
    const original = skill
      ? await startExamSkillPractice(course.id, 'graph-interpretation', { study })
      : await startConceptPractice(course.id, concept.id, { study });
    expect(original.attempt.receipt.lessonIds).toEqual([later.id]);
    const items = skill
      ? await listExamSkillPractice(course.id, now, study)
      : await listConceptPractice(course.id, now, [concept.id], study);
    expect(items[0].examDate).toBe(nearDate);
    const options = { study: { ...study, examDate: nearDate }, resume: true };
    const next = skill
      ? await startExamSkillPractice(course.id, 'graph-interpretation', options)
      : await startConceptPractice(course.id, concept.id, options);
    expect(next.attempt.receipt.lessonIds).toEqual([near.id]);
  },
);

async function fixture() {
  const course = await createCourse('Biology');
  const allowed = await createConcept(course.id, 'Cells');
  const outside = await createConcept(course.id, 'Enzymes');
  await createQuestionSet(
    {
      id: 'set',
      courseId: course.id,
      title: 'Cells and enzymes',
      lessonIds: [],
      assessmentIds: [],
      questions: [
        { id: 'a-prerequisite', prerequisites: [outside.id], targets: [allowed.id] },
        { id: 'b-mixed-targets', prerequisites: [], targets: [allowed.id, outside.id] },
        { id: 'c-cells', prerequisites: [], targets: [allowed.id] },
      ].map(({ id, prerequisites, targets }) => ({
        id,
        prompt: `Explain ${id}`,
        parts: [],
        answer: {
          maxMarks: targets.length,
          response: { kind: 'written' as const },
          prerequisiteConceptIds: prerequisites,
          allocations: targets.map((conceptId, index) => ({
            id: `${id}-${index}`,
            criterion: 'Explains the relationship',
            maxMarks: 1,
            dimension: 'application' as const,
            targetConceptIds: [conceptId],
          })),
        },
      })),
    },
    100,
  );
  return { course, allowed, outside };
}

it('keeps every target and prerequisite within the allowed study scope', async () => {
  const { course, allowed, outside } = await fixture();
  const scopeConceptIds = [allowed.id];
  expect(await listConceptPractice(course.id, 200, scopeConceptIds)).toEqual([
    expect.objectContaining({ conceptId: allowed.id, availableCount: 1, unseenCount: 1 }),
  ]);
  const result = await startConceptPractice(course.id, allowed.id, {
    now: 200,
    scopeConceptIds,
  });
  expect(result.attempt.receipt.questions.map((question) => question.id)).toEqual(['c-cells']);
  await expect(
    startConceptPractice(course.id, allowed.id, { now: 210, scopeConceptIds }),
  ).rejects.toThrow(/unseen/i);
  await expect(
    startConceptPractice(course.id, outside.id, { now: 210, scopeConceptIds }),
  ).rejects.toThrow(/No Concepts are due/);
});

it('keeps authored lesson prerequisites on shared Concepts, including resumed drafts', async () => {
  const { course, allowed } = await fixture();
  const lesson = await createLesson(course.id, 'Not yet learned');
  await db.questionSets.update('set', { lessonIds: [lesson.id] });
  await startConceptPractice(course.id, allowed.id, { now: 200 });
  const scopeConceptIds = [allowed.id];
  const options = { scopeLessonIds: [] };
  expect((await listConceptPractice(course.id, 210, scopeConceptIds, options))[0]).toMatchObject({
    availableCount: 0,
    unfinished: false,
  });
  await expect(
    startConceptPractice(course.id, allowed.id, {
      now: 210,
      scopeConceptIds,
      resume: true,
      study: options,
    }),
  ).rejects.toThrow(/No questions/);
  const resumed = await startConceptPractice(course.id, allowed.id, {
    now: 220,
    resume: true,
    study: { scopeLessonIds: [lesson.id] },
  });
  expect(resumed.selection.questionId).toBe('a-prerequisite');
});

it('resumes one persisted draft under simultaneous starts and refuses an out-of-scope receipt', async () => {
  const { course, allowed } = await fixture();
  const original = await startConceptPractice(course.id, allowed.id, { now: 200 });
  expect(original.selection.questionId).toBe('a-prerequisite');
  const options = { now: 210, scopeConceptIds: [allowed.id], resume: true };
  const [first, second] = await Promise.all([
    startConceptPractice(course.id, allowed.id, options),
    startConceptPractice(course.id, allowed.id, options),
  ]);
  expect(first.selection.questionId).toBe('c-cells');
  expect(second.attempt.id).toBe(first.attempt.id);
  const saved = await saveQuestionSetResponseDraft(
    first.attempt.id,
    first.attempt.revisionId,
    'c-cells',
    { kind: 'written', text: 'The membrane controls movement.' },
    'c-cells',
    220,
  );
  const resumed = await startConceptPractice(course.id, allowed.id, { ...options, now: 230 });
  expect(resumed.attempt).toEqual(saved);
  expect(await db.questionSetAttempts.count()).toBe(2);
  expect((await listConceptPractice(course.id, 230, [allowed.id]))[0]).toMatchObject({
    unfinished: true,
    unseenCount: 0,
  });
});
