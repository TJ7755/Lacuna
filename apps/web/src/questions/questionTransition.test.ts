import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildCourseShareCode, decodeShare } from '../db/share';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import { pruneExpiredTombstones } from '../db/tombstonePrune';
import { exportDatabase, importBackup } from '../db/portability';
import {
  createConcept,
  createFixedQuestion,
  updateFixedQuestion,
  createGeneratedQuestion,
  startQuestionAttempt,
  answerQuestionAttempt,
  snapshotQuestion,
  deleteQuestion,
  restoreQuestion,
} from './repository';
import { listQuestionSets, deleteQuestionSet } from './questionSetRepository';
import {
  startConceptPractice,
  listConceptPractice,
  deriveConceptApplicationSchedules,
} from './conceptPractice';
import {
  startQuestionSetAttempt,
  saveQuestionSetResponseDraft,
  submitPracticeQuestion,
  saveQuestionSetMarking,
  completeQuestionSetAttempt,
  undoConceptPracticeAttempt,
} from './questionSetAttemptRepository';
import { transitionScheduleSeeds } from './questionTransitionSchedules';
import { ensureQuestionTransition } from './questionTransitionRepository';
import { practiceContext } from './questionPracticeSelection';
import { questionGeneratorRegistry } from './generators';
import { questionPresentationFingerprint } from './generators/declarative';
import { mergeSnapshots } from '../sync/mergeSnapshots';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

async function fixed() {
  const course = await createCourse('Algebra');
  const concept = await createConcept(course.id, 'Solve equations');
  const question = await createFixedQuestion({
    courseId: course.id,
    name: 'Equation',
    prompt: 'Solve $x+1=4$.',
    payload: {
      v: 1,
      kind: 'numeric',
      answer: { kind: 'exact', value: '3' },
      fixtures: [{ id: 'correct', studentAnswer: '3', expectedMarks: 1 }],
    },
    explanation: 'Subtract one.',
    targetConceptId: concept.id,
    now: 100,
  });
  return { course, concept, question };
}

it('upgrades v31 without rewriting schedules, submitted evidence, corrections or payload fixtures', async () => {
  const { question, course } = await fixed();
  const shown = await startQuestionAttempt({
    questionId: question.id,
    sessionId: 'old-session',
    now: 200,
  });
  await answerQuestionAttempt({
    attemptId: shown.id,
    submittedAnswer: '3',
    marksEarned: 1,
    marksAvailable: 1,
    now: 300,
  });
  const { migratedToSetId: _marker, ...source } = (await db.questions.get(question.id))!;
  const links = (await db.questionConcepts.get(question.id))!;
  const evidence = (await db.questionAttempts.get(shown.id))!;
  db.close();
  await db.delete();
  const old = new Dexie('lacuna');
  old.version(31).stores({
    questions: 'id',
    questionConcepts: 'questionId',
    questionAttempts: 'id',
    questionSets: 'id',
    tombstones: '[table+recordId]',
  });
  await old.open();
  await old.table('questions').add(source);
  await old.table('questionConcepts').add(links);
  await old.table('questionAttempts').add(evidence);
  old.close();
  await db.open();
  const migrated = (await db.questions.get(source.id))!;
  expect(migrated).toEqual({ ...source, migratedToSetId: expect.any(String) });
  expect(await db.questionAttempts.get(shown.id)).toEqual(evidence);
  const [set] = await listQuestionSets(course.id);
  expect(set.legacyQuestionId).toBe(source.id);
  expect(set.questions[0].prompt).toBe('Solve $x+1=4$.');
  expect(set.questions[0].answer?.allocations[0]).toMatchObject({
    criterion: 'Answer: 3.',
    targetConceptIds: links.targetConceptIds,
  });
  const seeds = transitionScheduleSeeds([migrated], [set]);
  expect(deriveConceptApplicationSchedules([], seeds).get(links.targetConceptIds[0])).toMatchObject(
    {
      due: source.due,
      stability: source.stability,
      difficulty: source.difficulty,
      reps: 1,
    },
  );
});

it('keeps retired data and transition identity through backup replacement and peer merge', async () => {
  const { course, question } = await fixed();
  const before = await exportDatabase();
  const merged = mergeSnapshots(before, before);
  await importBackup(merged, 'replace');
  const [set] = await listQuestionSets(course.id);
  expect(set.legacyQuestionId).toBe(question.id);
  expect(await db.questions.get(question.id)).toEqual(before.questions![0]);
  expect((await exportDatabase()).questionSets).toEqual(before.questionSets);
  const snapshot = (await snapshotQuestion(question.id))!;
  await deleteQuestion(question.id, Date.now());
  expect(await db.questionSets.get(set.id)).toBeUndefined();
  await restoreQuestion(snapshot);
  expect(await db.questionSets.get(set.id)).toMatchObject({ legacyQuestionId: question.id });
});

it('does not resurrect deleted migrated sets after deletion receipts expire', async () => {
  const { course } = await fixed();
  const [set] = await listQuestionSets(course.id);
  await deleteQuestionSet(set.id, Date.now());
  await pruneExpiredTombstones(Date.now() + 1000, 0);
  await ensureQuestionTransition(course.id);
  expect(await listQuestionSets(course.id)).toEqual([]);
  const published = await decodeShare(await buildCourseShareCode(course.id));
  if (published.v !== 6) throw new Error('Expected a current course share.');
  expect(published.questions).toEqual([]);
  expect(published.questionSets).toEqual([]);
  const backup = await exportDatabase();
  await importBackup(backup, 'replace');
  expect(await listQuestionSets(course.id)).toEqual([]);
});

it('uses the complete pinned generator corpus in shared practice and preserves old exposure', async () => {
  const { course, concept } = await fixed();
  const generated = await createGeneratedQuestion({
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
  const oldInstance = questionGeneratorRegistry.audit({
    generatorKey: generated.generatorKey,
    generatorVersion: generated.generatorVersion,
    configuration: generated.generatorConfig,
  }).instances[0].resolved;
  await startQuestionAttempt({
    questionId: generated.id,
    sessionId: 'earlier-generated',
    instance: oldInstance,
  });
  const data = await practiceContext(course.id);
  const variants = data.candidates.filter((row) => row.set.legacyQuestionId === generated.id);
  expect(new Set(variants.map((row) => row.fingerprint)).size).toBe(3);
  const { attempt } = await startConceptPractice(course.id, concept.id);
  expect(attempt.receipt.legacyQuestionId).toBeDefined();
  const source = (await db.questions.get(generated.id))!;
  expect(source.kind === 'generated' && source.generatorConfig).toEqual(generated.generatorConfig);
  expect(data.seen.has(variants[0].fingerprint)).toBe(true);
  const original = variants[1];
  const direct = await startQuestionSetAttempt(original.set.id, 'practice', Date.now(), {
    questionSetId: original.set.id,
    questionId: original.question.id,
    novelty: 'unseen',
    fingerprint: original.fingerprint,
  });
  expect(questionPresentationFingerprint(direct.receipt.questions[0])).toBe(original.fingerprint);
  await db.questions.update(generated.id, { suspended: true });
  expect(
    (await practiceContext(course.id)).candidates.some(
      (row) => row.set.legacyQuestionId === generated.id,
    ),
  ).toBe(false);
  await expect(startQuestionSetAttempt(original.set.id, 'practice')).rejects.toThrow('suspended');
  expect((await listConceptPractice(course.id))[0].availableCount).toBe(1);
});

it('advances native concept practice from the retained schedule and restores that baseline on undo', async () => {
  const { course, concept, question } = await fixed();
  const old = await startQuestionAttempt({ questionId: question.id, sessionId: 'old', now: 200 });
  await answerQuestionAttempt({
    attemptId: old.id,
    submittedAnswer: '3',
    marksEarned: 1,
    marksAvailable: 1,
    now: 300,
  });
  const source = (await db.questions.get(question.id))!;
  const [set] = await listQuestionSets(course.id);
  const seeds = transitionScheduleSeeds([source], [set]);
  let { attempt } = await startConceptPractice(course.id, concept.id, {
    now: 400,
    mode: 'mixed',
    allowFamiliar: true,
  });
  const node = attempt.receipt.questions[0];
  attempt = await saveQuestionSetResponseDraft(
    attempt.id,
    attempt.revisionId,
    node.id,
    { kind: 'calculation', text: '3' },
    node.id,
    410,
  );
  attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, node.id, 420);
  attempt = await saveQuestionSetMarking(
    attempt.id,
    attempt.revisionId,
    {
      decisions: node.answer!.allocations.map((point) => ({
        allocationId: point.id,
        status: 'awarded',
        marks: point.maxMarks,
      })),
      annotations: [],
      corrections: [],
      reflection: { reasons: [], note: '' },
      activeNodeId: node.id,
      activeAllocationId: null,
    },
    430,
  );
  attempt = await completeQuestionSetAttempt(attempt.id, attempt.revisionId, 440);
  expect(deriveConceptApplicationSchedules([attempt], seeds).get(concept.id)?.reps).toBe(
    source.reps + 1,
  );
  attempt = await undoConceptPracticeAttempt(attempt.id, attempt.revisionId, 450);
  expect(deriveConceptApplicationSchedules([attempt], seeds).get(concept.id)).toEqual(
    seeds.get(concept.id)?.state,
  );
  expect(await db.questions.get(question.id)).toEqual(source);
});

it('source authoring refreshes a stamped migrated set without discarding its assessment membership', async () => {
  const { course, question } = await fixed();
  const [set] = await listQuestionSets(course.id);
  const assessment = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
  await db.questionSets.update(set.id, { assessmentIds: [assessment.id], updatedAt: 1000 });
  await updateFixedQuestion(question.id, { prompt: 'Solve $x+2=5$.' }, 200);
  expect(await db.questionSets.get(set.id)).toMatchObject({
    assessmentIds: [assessment.id],
    contentVersion: 2,
    updatedAt: 1001,
    questions: [{ prompt: 'Solve $x+2=5$.' }],
  });
});
