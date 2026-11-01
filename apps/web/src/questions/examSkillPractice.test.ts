import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import { createConcept } from './repository';
import { createQuestionSet } from './questionSetRepository';
import { listExamSkillPractice, startExamSkillPractice } from './examSkillPractice';
import type { MarkAllocation, QuestionSetQuestion } from '@lacuna/core/questions/questionSets';
import { importQuestionBank } from './bank';
import familyExample from '../../../../docs/question-bank/examples/numeric-family.json';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('selects explicitly authored applicable techniques independently of knowledge identity and preserves saved novelty', async () => {
  const course = await createCourse('Biology');
  const otherCourse = await createCourse('Other');
  const a = await createConcept(course.id, 'ADH release');
  const b = await createConcept(course.id, 'Alleles');
  const question = (
    id: string,
    targets: string[],
    dimension: MarkAllocation['dimension'] = 'application',
    source: 'author' | 'jev' = 'author',
  ): QuestionSetQuestion => ({
    id,
    prompt: `Explain ${id}`,
    parts: [],
    answer: {
      maxMarks: 1,
      response: { kind: 'written' },
      prerequisiteConceptIds: [],
      allocations: [
        {
          id: `${id}-mark`,
          criterion: 'Interpret the trend',
          maxMarks: 1,
          dimension,
          targetConceptIds: targets,
          techniqueTags: {
            taxonomyId: 'science-techniques',
            taxonomyVersion: 1,
            techniqueIds: ['graph-interpretation'],
            provenance: source === 'author' ? { source } : { source, model: 'fixture' },
          },
        },
      ],
    },
  });
  const untagged = question('untagged', [a.id]);
  delete untagged.answer!.allocations[0].techniqueTags;
  const questions = [
    question('zero', []),
    question('multi', [a.id, b.id]),
    question('recall', [a.id], 'knowledge'),
    question('machine-classified', [a.id], 'application', 'jev'),
    untagged,
  ];
  await createQuestionSet({
    id: 'set',
    courseId: course.id,
    title: 'Facts are not skills',
    lessonIds: [],
    assessmentIds: [],
    questions,
  });
  await createQuestionSet({
    id: 'outside-set',
    courseId: otherCourse.id,
    title: 'Other course',
    lessonIds: [],
    assessmentIds: [],
    questions: [question('outside', [])],
  });
  expect(await listExamSkillPractice(course.id)).toMatchObject([
    {
      techniqueId: 'graph-interpretation',
      name: 'Interpret a graph',
      availableCount: 2,
      unseenCount: 2,
    },
  ]);
  const first = (await startExamSkillPractice(course.id, 'graph-interpretation')).attempt;
  const second = (await startExamSkillPractice(course.id, 'graph-interpretation')).attempt;
  expect(new Set([first.receipt.questions[0].id, second.receipt.questions[0].id])).toEqual(
    new Set(['zero', 'multi']),
  );
  for (const attempt of [first, second]) {
    expect(attempt.conceptPractice).toBeUndefined();
    expect(attempt.receipt.questions).toEqual([
      questions.find((question) => question.id === attempt.receipt.questions[0].id),
    ]);
    expect((await db.questionSetAttempts.get(attempt.id))?.receipt).toEqual(attempt.receipt);
  }
  await expect(startExamSkillPractice(course.id, 'graph-interpretation')).rejects.toThrow(/unseen/);
  await expect(startExamSkillPractice(course.id, 'calculation-setup')).rejects.toThrow(
    /No eligible/,
  );
  await expect(
    startExamSkillPractice(course.id, 'graph-interpretation', {
      blueprint: { type: 'calculation' },
      allowFamiliar: true,
    }),
  ).rejects.toThrow(/No eligible/);
  expect(
    (await startExamSkillPractice(course.id, 'graph-interpretation', { allowFamiliar: true }))
      .attempt.receipt.questions,
  ).toHaveLength(1);
  await db.courses.update(course.id, { archived: true });
  await expect(
    startExamSkillPractice(course.id, 'graph-interpretation', { allowFamiliar: true }),
  ).rejects.toThrow(/unavailable/);
});

it('counts generated question capacity once and skips saved family variants', async () => {
  const course = await createCourse('Physics');
  const bank = structuredClone(familyExample);
  const allocation = bank.families[0].template.questions[0].answer.allocations[0];
  Object.assign(allocation, {
    techniqueTags: {
      taxonomyId: 'science-techniques',
      taxonomyVersion: 1,
      techniqueIds: ['calculation-setup'],
      provenance: { source: 'author' },
    },
  });
  await importQuestionBank(bank, course.id);
  expect(await listExamSkillPractice(course.id)).toMatchObject([
    {
      techniqueId: 'calculation-setup',
      name: 'Set up a calculation',
      availableCount: 6,
      unseenCount: 6,
    },
  ]);
  const indices = new Set<number>();
  for (let index = 0; index < 6; index++) {
    const { attempt } = await startExamSkillPractice(course.id, 'calculation-setup', {
      blueprint: { type: bank.families[0].blueprint.type },
    });
    indices.add(attempt.receipt.bank!.variant!.index);
    expect(attempt.receipt.questions[0].answer!.allocations[0].targetConceptIds).toHaveLength(1);
  }
  expect(indices.size).toBe(6);
  expect((await listExamSkillPractice(course.id))[0]).toMatchObject({
    unseenCount: 0,
    availableCount: 6,
  });
  await expect(startExamSkillPractice(course.id, 'calculation-setup')).rejects.toThrow(/unseen/);
});
