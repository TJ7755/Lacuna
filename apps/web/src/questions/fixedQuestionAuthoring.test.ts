import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { importLineageFirstTime, mergeLineageUpdate } from '../db/mergeImport';
import { questionPayloadV3 } from '../db/mergeImport.testFixtures';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import { exportDatabase, importBackup } from '../db/portability';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { createConcept } from './repository.concepts';
import {
  createFixedQuestion,
  updateFixedQuestion,
  createGeneratedQuestion,
} from './repository.authoring';
import {
  createQuestionSetDraft,
  saveQuestionSetDraft,
  publishQuestionSetDraft,
} from './questionSetDrafts';
import { ensureQuestionTransition } from './questionTransitionRepository';
import { startQuestionSetAttempt } from './questionSetAttemptRepository';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

it('publishes migrated fixed content without rewriting its source, attempts or restored authoring ownership', async () => {
  const course = await createCourse('Algebra');
  const concept = await createConcept(course.id, 'Equations');
  const source = await createFixedQuestion({
    courseId: course.id,
    targetConceptId: concept.id,
    name: 'Equation',
    prompt: 'Solve x + 1 = 4.',
    explanation: 'Subtract one.',
    payload: {
      v: 1,
      kind: 'numeric',
      answer: { kind: 'exact', value: '3' },
      fixtures: [{ id: 'correct', studentAnswer: '3', expectedMarks: 1 }],
    },
  });
  const originalSource = await db.questions.get(source.id);
  const originalLinks = await db.questionConcepts.get(source.id);
  const set = (await db.questionSets.get(source.migratedToSetId!))!;
  const attempt = await startQuestionSetAttempt(set.id, 'practice');
  const draft = createQuestionSetDraft(set, set.contentRevisionId);
  draft.content.questions[0].prompt = 'Solve x + 2 = 5.';
  const saved = await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
  const published = await publishQuestionSetDraft(course.id, set.id, saved.draftRevisionId);

  expect(published.questions[0].prompt).toBe('Solve x + 2 = 5.');
  expect(published.legacyQuestionId).toBe(source.id);
  expect(published.contentRevisionId).not.toBe(set.contentRevisionId);
  expect(await db.questions.get(source.id)).toEqual(originalSource);
  expect(await db.questionConcepts.get(source.id)).toEqual(originalLinks);
  expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
  await expect(updateFixedQuestion(source.id, { prompt: 'Stale source edit' })).rejects.toThrow(
    'composer',
  );
  await ensureQuestionTransition(course.id, true);
  expect(await db.questionSets.get(set.id)).toEqual(published);

  const backup = await exportDatabase();
  await importBackup(mergeSnapshots(backup, backup), 'replace');
  await ensureQuestionTransition(course.id, new Set([source.id]));
  expect(await db.questionSets.get(set.id)).toEqual(published);
  expect(await db.questions.get(source.id)).toEqual(originalSource);
  expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
});

it('does not refresh or delete composer edits when an old publisher changes or withdraws its source', async () => {
  const initial = questionPayloadV3();
  const { course } = await importLineageFirstTime(initial);
  const source = (await db.questions.get('question-quadratic'))!;
  const set = (await db.questionSets.get(source.migratedToSetId!))!;
  const draft = createQuestionSetDraft(set, set.contentRevisionId);
  draft.content.questions[0].prompt = 'My authored question';
  const saved = await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
  const published = await publishQuestionSetDraft(course.id, set.id, saved.draftRevisionId);
  await mergeLineageUpdate(
    course.id,
    questionPayloadV3({
      rv: 2,
      at: 2000,
      questions: initial.questions.map((question) => ({ ...question, n: 'Publisher rename' })),
    }),
  );
  expect(await db.questionSets.get(set.id)).toEqual(published);
  const retainedSource = await db.questions.get(source.id);
  expect(retainedSource).toEqual(source);
  await expect(
    mergeLineageUpdate(
      course.id,
      questionPayloadV3({
        rv: 3,
        at: 3000,
        questions: [],
      }),
    ),
  ).rejects.toThrow('composer edits');
  expect(await db.questionSets.get(set.id)).toEqual(published);
  expect(await db.questions.get(source.id)).toEqual(retainedSource);
});

it('retains generated configuration ownership and the unpublished draft when composer publishing is attempted', async () => {
  const course = await createCourse('Algebra');
  const concept = await createConcept(course.id, 'Quadratics');
  const source = await createGeneratedQuestion({
    courseId: course.id,
    targetConceptId: concept.id,
    name: 'Quadratics',
    generatorKey: 'integer-root-quadratic',
    generatorVersion: 1,
    generatorConfig: {
      minimumRootMagnitude: 1,
      maximumRootMagnitude: 1,
      maximumLeadingCoefficient: 1,
      allowRepeatedRoots: true,
    },
  });
  const set = (await db.questionSets.get(source.migratedToSetId!))!;
  const draft = createQuestionSetDraft(set, set.contentRevisionId);
  draft.content.title = 'Attempted composer edit';
  const saved = await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
  await expect(publishQuestionSetDraft(course.id, set.id, saved.draftRevisionId)).rejects.toThrow(
    'configure this generator',
  );
  expect(await db.questionSets.get(set.id)).toEqual(set);
  expect(await db.questions.get(source.id)).toEqual(source);
});
