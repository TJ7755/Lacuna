import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { createCourse } from '../db/repository';
import { db } from '../db/schema';
import { listConceptPractice, startConceptPractice } from './conceptPractice';
import { saveQuestionSetResponseDraft } from './questionSetAttemptRepository';
import { createQuestionSet } from './questionSetRepository';
import { createConcept } from './repository';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});

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
