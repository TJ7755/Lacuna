import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import { createConcept } from './repository.concepts';
import { createGeneratedQuestion, updateGeneratedQuestion } from './repository.authoring';
import { startQuestionSetAttempt } from './questionSetAttemptRepository';
import { transitionedSetId } from './questionTransition';
import {
  createEmptyQuestionSetDraft,
  createQuestionSetDraft,
  saveQuestionSetDraft,
  loadQuestionSetDraft,
  publishQuestionSetDraft,
} from './questionSetDrafts';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const configuration = {
  minimumRootMagnitude: 1,
  maximumRootMagnitude: 1,
  maximumLeadingCoefficient: 1,
  allowRepeatedRoots: true,
};

it('creates a generated source from a shared draft, then publishes configuration without changing frozen attempts', async () => {
  const course = await createCourse('Algebra');
  const concept = await createConcept(course.id, 'Quadratics');
  const id = 'generated-source';
  const draft = createEmptyQuestionSetDraft(course.id, transitionedSetId(id));
  draft.content.title = 'Generated quadratics';
  draft.content.legacyQuestionId = id;
  draft.generated = {
    sourceRevisionId: null,
    suspended: false,
    targetConceptId: concept.id,
    prerequisiteConceptIds: [],
    generatorKey: 'integer-root-quadratic',
    generatorVersion: 1,
    configuration,
  };
  const saved = await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
  expect((await loadQuestionSetDraft(course.id, draft.content.id))?.generated).toEqual(
    draft.generated,
  );
  const published = await publishQuestionSetDraft(
    course.id,
    draft.content.id,
    saved.draftRevisionId,
  );
  const source = (await db.questions.get(id))!;
  expect(source).toMatchObject({
    kind: 'generated',
    migratedToSetId: published.id,
    generatorKey: 'integer-root-quadratic',
    generatorVersion: 1,
    generatorConfig: configuration,
  });
  const attempt = await startQuestionSetAttempt(published.id, 'practice');
  const next = createQuestionSetDraft(published, published.contentRevisionId);
  next.generated = {
    ...draft.generated,
    sourceRevisionId: source.authoringRevisionId,
    suspended: false,
    configuration: { ...configuration, maximumRootMagnitude: 2 },
  };
  next.content.title = 'Updated family';
  const savedNext = await saveQuestionSetDraft(next, { expectedDraftRevisionId: null });
  const updated = await publishQuestionSetDraft(course.id, published.id, savedNext.draftRevisionId);
  expect(updated).toMatchObject({
    id: published.id,
    legacyQuestionId: id,
    title: 'Updated family',
  });
  expect(updated.contentRevisionId).not.toBe(published.contentRevisionId);
  expect(await db.questions.get(id)).toMatchObject({
    generatorKey: 'integer-root-quadratic',
    generatorVersion: 1,
    generatorConfig: { maximumRootMagnitude: 2 },
  });
  expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
  expect(await loadQuestionSetDraft(course.id, published.id)).toBeNull();
});

it('retains stale and invalid drafts without overwriting the source or generator identity', async () => {
  const course = await createCourse('Algebra');
  const concept = await createConcept(course.id, 'Quadratics');
  const source = await createGeneratedQuestion({
    courseId: course.id,
    targetConceptId: concept.id,
    name: 'Quadratics',
    generatorKey: 'integer-root-quadratic',
    generatorVersion: 1,
    generatorConfig: configuration,
  });
  const set = (await db.questionSets.get(source.migratedToSetId!))!;
  const draft = createQuestionSetDraft(set, set.contentRevisionId);
  draft.generated = {
    sourceRevisionId: source.authoringRevisionId,
    suspended: false,
    targetConceptId: concept.id,
    prerequisiteConceptIds: [],
    generatorKey: source.generatorKey,
    generatorVersion: source.generatorVersion,
    configuration: { ...configuration, maximumRootMagnitude: 2 },
  };
  const saved = await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
  await updateGeneratedQuestion(source.id, { name: 'Newer name' });
  const latest = await db.questions.get(source.id);
  await expect(publishQuestionSetDraft(course.id, set.id, saved.draftRevisionId)).rejects.toThrow(
    'changed since',
  );
  expect(await db.questions.get(source.id)).toEqual(latest);
  expect(await loadQuestionSetDraft(course.id, set.id)).toEqual(saved);
  const current = (await db.questionSets.get(set.id))!;
  saved.baseContentRevisionId = current.contentRevisionId;
  saved.generated!.sourceRevisionId = latest!.authoringRevisionId;
  saved.generated!.generatorVersion = 99;
  const invalid = await saveQuestionSetDraft(saved, {
    expectedDraftRevisionId: saved.draftRevisionId,
  });
  await expect(publishQuestionSetDraft(course.id, set.id, invalid.draftRevisionId)).rejects.toThrow(
    'ownership mismatch',
  );
  expect(await db.questions.get(source.id)).toEqual(latest);
  expect(await loadQuestionSetDraft(course.id, set.id)).toEqual(invalid);
});
