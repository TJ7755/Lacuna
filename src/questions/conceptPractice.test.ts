import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import familyExample from '../../docs/question-bank/examples/numeric-family.json';
import { db } from '../db/schema';
import { createCard } from '../db/cardRepository';
import { createCourse } from '../db/repository';
import { createConcept } from './repository';
import { createQuestionSet } from './questionSetRepository';
import {
  completeQuestionSetAttempt,
  saveQuestionSetMarking,
  startQuestionSetAttempt,
  submitPracticeQuestion,
  submitQuestionSetPaper,
} from './questionSetAttemptRepository';
import { importQuestionBank, parseQuestionBank } from './bank';
import {
  deriveConceptApplicationSchedules,
  listConceptPractice,
  startConceptPractice,
  conceptPracticeFingerprint,
  undoConceptPracticeAttempt,
} from './conceptPractice';
import { mergeQuestionSetAttemptPair } from './questionSetAttemptMerge';
import { emptyQuestionSchedule, scheduleQuestionReview } from './scheduler';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});
async function fixture() {
  const course = await createCourse('Biology');
  const concept = await createConcept(course.id, 'Transport');
  const set = await createQuestionSet(
    {
      id: 'set',
      courseId: course.id,
      title: 'Transport',
      lessonIds: [],
      assessmentIds: [],
      questions: ['q1', 'q2'].map((id) => ({
        id,
        prompt: 'Explain transport ' + id,
        parts: [],
        answer: {
          maxMarks: 2,
          response: { kind: 'written' as const },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: id + 'a',
              criterion: 'Explains',
              maxMarks: 2,
              dimension: 'application' as const,
              targetConceptIds: [concept.id],
            },
          ],
        },
      })),
    },
    100,
  );
  return { course, concept, set };
}
it('selects unseen questions, preserves a single question receipt and refuses silent repeats', async () => {
  const { course, concept } = await fixture();
  expect((await listConceptPractice(course.id, 200))[0]).toMatchObject({
    conceptId: concept.id,
    due: true,
    unseenCount: 2,
  });
  const first = await startConceptPractice(course.id, concept.id, { now: 200 });
  expect(first.attempt.receipt.questions).toHaveLength(1);
  const second = await startConceptPractice(course.id, concept.id, { now: 210 });
  expect(second.selection.questionId).not.toBe(first.selection.questionId);
  await expect(startConceptPractice(course.id, concept.id, { now: 220 })).rejects.toThrow(
    /unseen/i,
  );
  expect(
    (await startConceptPractice(course.id, concept.id, { now: 230, allowFamiliar: true })).selection
      .novelty,
  ).toBe('familiar');
});
it('freezes first self marks, replays partial credit once and excludes undo and legacy evidence', async () => {
  const { course, concept, set } = await fixture();
  let { attempt } = await startConceptPractice(course.id, concept.id, { now: 200 });
  const q = attempt.receipt.questions[0];
  attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, q.id, 210);
  const input = {
    decisions: [
      { allocationId: q.answer!.allocations[0].id, status: 'awarded' as const, marks: 1 },
    ],
    annotations: [],
    corrections: [],
    reflection: { reasons: [], note: '' },
    activeNodeId: q.id,
    activeAllocationId: null,
  };
  attempt = await saveQuestionSetMarking(attempt.id, attempt.revisionId, input, 220);
  expect(deriveConceptApplicationSchedules([attempt]).get(concept.id)).toBeUndefined();
  attempt = await completeQuestionSetAttempt(attempt.id, attempt.revisionId, 230);
  expect(deriveConceptApplicationSchedules([attempt]).get(concept.id)?.reps).toBe(1);
  const first = structuredClone(attempt);
  expect(deriveConceptApplicationSchedules([attempt]).get(concept.id)).toEqual(
    scheduleQuestionReview(
      emptyQuestionSchedule(),
      1,
      attempt.firstMarking![0].schedulerConfig,
      230,
    ).schedule,
  );
  const courseBefore = (await db.courses.get(course.id))!;
  const configBefore = structuredClone(attempt.firstMarking![0].schedulerConfig);
  await db.courses.update(course.id, {
    fsrsParameters: { ...courseBefore.fsrsParameters, requestRetention: 0.97 },
  });
  expect((await listConceptPractice(course.id, 240))[0].schedule).toEqual(
    deriveConceptApplicationSchedules([first]).get(concept.id),
  );
  expect(attempt.firstMarking![0].schedulerConfig).toEqual(configBefore);
  attempt = await saveQuestionSetMarking(
    attempt.id,
    attempt.revisionId,
    { ...input, decisions: [{ ...input.decisions[0], marks: 2 }] },
    240,
  );
  expect(attempt.firstMarking).toEqual(first.firstMarking);
  expect(deriveConceptApplicationSchedules([attempt])).toEqual(
    deriveConceptApplicationSchedules([first]),
  );
  attempt = await undoConceptPracticeAttempt(attempt.id, attempt.revisionId, 250);
  expect(deriveConceptApplicationSchedules([attempt]).size).toBe(0);
  expect(mergeQuestionSetAttemptPair(first, attempt)).toEqual(
    mergeQuestionSetAttemptPair(attempt, first),
  );
  const legacy = { ...first };
  delete legacy.firstMarking;
  expect(deriveConceptApplicationSchedules([legacy]).size).toBe(0);
  expect(await startQuestionSetAttempt(set.id, 'practice', 260)).toMatchObject({
    questionSetId: set.id,
  });
});
it('attributes multipart follow-through to its own Concept, without double credit or uncertain transfers', async () => {
  const { course, concept, set } = await fixture();
  const downstream = await createConcept(course.id, 'Using the result');
  const other = await createConcept(course.id, 'Other');
  const answer = (id: string, targetConceptIds: string[], maxMarks = 1) => ({
    maxMarks,
    response: { kind: 'written' as const },
    prerequisiteConceptIds: [],
    allocations: [
      { id, criterion: 'Evidence', maxMarks, dimension: 'application' as const, targetConceptIds },
    ],
  });
  const multipart = await createQuestionSet(
    {
      ...set,
      id: 'multipart',
      questions: [
        {
          id: 'multi',
          prompt: 'Find and use a result.',
          parts: [
            {
              id: 'upstream',
              prompt: 'Find it',
              answer: answer('up-a', [concept.id]),
              subparts: [],
            },
            {
              id: 'follow',
              prompt: 'Use your result',
              answer: answer('follow-a', [downstream.id]),
              subparts: [],
            },
            {
              id: 'follow-again',
              prompt: 'Explain your method',
              answer: answer('follow-b', [downstream.id], 2),
              subparts: [],
            },
            {
              id: 'ambiguous',
              prompt: 'Mixed evidence',
              answer: answer('mixed-a', [other.id, concept.id]),
              subparts: [],
            },
          ],
        },
      ],
    },
    150,
  );
  let attempt = await startQuestionSetAttempt(multipart.id, 'practice', 200);
  attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, 'multi', 210);
  attempt = await saveQuestionSetMarking(
    attempt.id,
    attempt.revisionId,
    {
      decisions: [
        { allocationId: 'up-a', status: 'awarded', marks: 0 },
        { allocationId: 'follow-a', status: 'awarded', marks: 1 },
        { allocationId: 'follow-b', status: 'awarded', marks: 1 },
        { allocationId: 'mixed-a', status: 'awarded', marks: 1 },
      ],
      annotations: [],
      corrections: [],
      reflection: { reasons: [], note: '' },
      activeNodeId: 'follow',
      activeAllocationId: null,
    },
    220,
  );
  attempt = await completeQuestionSetAttempt(attempt.id, attempt.revisionId, 230);
  const schedules = deriveConceptApplicationSchedules([attempt]);
  expect(schedules.get(downstream.id)?.reps).toBe(1);
  expect(schedules.has(concept.id)).toBe(false);
  expect(schedules.has(other.id)).toBe(false);
  const uncertain = structuredClone(attempt);
  uncertain.firstMarking![0].decisions[1] = { allocationId: 'follow-a', status: 'unsure' };
  expect(deriveConceptApplicationSchedules([uncertain]).size).toBe(0);
  uncertain.firstMarking![0].decisions.splice(1, 1);
  expect(deriveConceptApplicationSchedules([uncertain]).size).toBe(0);
  const assisted = {
    ...attempt,
    assistance: [{ nodeId: 'upstream', kind: 'related-knowledge' as const, occurredAt: 205 }],
  };
  expect(deriveConceptApplicationSchedules([assisted]).size).toBe(0);
  const disputed = { ...attempt, disputedQuestionIds: ['multi'] };
  expect(deriveConceptApplicationSchedules([disputed]).size).toBe(0);
  const competing = structuredClone(attempt);
  competing.revisionId = 'competing';
  competing.firstMarking![0].decisions[1] = {
    allocationId: 'follow-a',
    status: 'awarded',
    marks: 0,
  };
  const merged = mergeQuestionSetAttemptPair(attempt, competing);
  expect(merged).toEqual(mergeQuestionSetAttemptPair(competing, attempt));
  expect(merged.disputedQuestionIds).toEqual(['multi']);
  expect(merged.firstMarkingConflicts).toEqual(
    expect.arrayContaining([...attempt.firstMarking!, ...competing.firstMarking!]),
  );
  expect(deriveConceptApplicationSchedules([merged]).size).toBe(0);
  expect(mergeQuestionSetAttemptPair(merged, attempt)).toEqual(merged);
});
it('counts large families without storing variants and resolves one fresh variant for each receipt', async () => {
  const { course, concept, set } = await fixture();
  await db.questionSets.clear();
  const source = {
    title: 'Authored bank',
    reference: 'Unit 1',
    author: 'Course team',
    licence: 'CC0',
  };
  const blueprint = {
    skill: 'Transport',
    type: 'calculation',
    difficulty: 'standard',
    context: 'cells',
  };
  const question = { ...set.questions[0], prompt: 'Calculate {{a}} + {{b}}.' };
  const family = {
    id: 'transport-family',
    version: 1,
    parameters: {
      a: Array.from({ length: 10 }, (_, i) => i + 1),
      b: Array.from({ length: 100 }, (_, i) => i + 1),
    },
    derived: [],
    template: { title: 'Transport {{a}} {{b}}', questions: [question] },
    source,
    blueprint,
  };
  const representative = await createQuestionSet(
    {
      ...set,
      id: 'family',
      questions: [{ ...question, prompt: 'Calculate 1 + 1.' }],
      bank: {
        bankId: 'biology',
        bankVersion: 1,
        courseCode: 'bio',
        setId: family.id,
        source,
        blueprint,
        concepts: [{ id: concept.id, name: concept.name }],
        fingerprint: 'first',
        family,
        variant: { index: 0, parameters: { a: 1, b: 1 } },
      },
    },
    150,
  );
  expect((await listConceptPractice(course.id, 200))[0]).toMatchObject({
    availableCount: 1000,
    unseenCount: 1000,
  });
  expect(await db.questionSets.count()).toBe(1);
  const first = await startConceptPractice(course.id, concept.id, { now: 200 });
  const next = await startConceptPractice(course.id, concept.id, { now: 210 });
  expect(first.attempt.receipt.bank?.variant?.index).toBe(0);
  expect(next.attempt.receipt.bank?.variant?.index).toBe(1);
  expect(first.attempt.receipt.questions[0].prompt).not.toBe(
    next.attempt.receipt.questions[0].prompt,
  );
  expect(first.attempt.receipt.id).toBe(representative.id);
  expect((await listConceptPractice(course.id, 220))[0]).toMatchObject({
    availableCount: 1000,
    unseenCount: 998,
    familiarCount: 2,
  });
  expect(await db.questionSets.count()).toBe(1);
  const staticBank = {
    bankId: 'biology',
    bankVersion: 1,
    courseCode: 'bio',
    setId: 'essay',
    source,
    blueprint: { ...blueprint, type: 'written', difficulty: 'extended' },
    concepts: [{ id: concept.id, name: concept.name }],
    fingerprint: 'essay',
  };
  await createQuestionSet(
    {
      ...set,
      id: 'z-static',
      questions: [{ ...set.questions[0], prompt: 'Explain the mechanism.' }],
      bank: staticBank,
    },
    220,
  );
  const mixed = await startConceptPractice(course.id, undefined, { mode: 'mixed', now: 230 });
  expect(mixed.selection.questionSetId).toBe('z-static');
  const filtered = await startConceptPractice(course.id, undefined, {
    mode: 'mixed',
    blueprint: { type: 'calculation', difficulty: 'standard' },
    now: 240,
  });
  expect(filtered.selection.questionSetId).toBe('family');
  await expect(
    startConceptPractice(course.id, undefined, {
      mode: 'mixed',
      blueprint: { type: 'written' },
      now: 250,
    }),
  ).rejects.toThrow(/unseen/i);
});

it('uses presentation novelty and records only questions actually exposed by ordinary sets', async () => {
  const { course, concept, set } = await fixture();
  let attempt = await startQuestionSetAttempt(set.id, 'practice', 200);
  expect((await listConceptPractice(course.id, 210))[0]).toMatchObject({
    unseenCount: 1,
    familiarCount: 1,
  });
  const changed = structuredClone(set.questions[0]);
  changed.answer!.allocations[0].criterion = 'Revised marking guidance';
  changed.answer!.allocations[0].explanation = 'A clearer explanation';
  expect(conceptPracticeFingerprint(changed)).toBe(conceptPracticeFingerprint(set.questions[0]));
  changed.prompt += ' New visible information';
  expect(conceptPracticeFingerprint(changed)).not.toBe(
    conceptPracticeFingerprint(set.questions[0]),
  );
  const chosen = await startConceptPractice(course.id, concept.id, { now: 210 });
  expect(chosen.selection.questionId).toBe('q2');
  // Opening a later node persists its exposure even if the learner returns to the first.
  const { saveQuestionSetAttemptPosition } = await import('./questionSetAttemptRepository');
  attempt = await saveQuestionSetAttemptPosition(attempt.id, attempt.revisionId, 'q2', null, 220);
  attempt = await saveQuestionSetAttemptPosition(attempt.id, attempt.revisionId, 'q1', null, 230);
  expect(attempt.shownQuestionIds).toEqual(['q1', 'q2']);
});

it('keeps unopened Paper questions unseen after automatic blank submission', async () => {
  const { course, concept, set } = await fixture();
  let attempt = await startQuestionSetAttempt(set.id, 'paper', 200);
  attempt = await submitQuestionSetPaper(attempt.id, attempt.revisionId, 210);
  expect((await listConceptPractice(course.id, 220))[0]).toMatchObject({
    unseenCount: 1,
    familiarCount: 1,
  });
  expect(attempt.shownQuestionIds).toEqual(['q1']);

  // Older receipts have no explicit visit history; blank Paper submission is not a visit.
  delete attempt.shownQuestionIds;
  await db.questionSetAttempts.put(attempt);
  expect((await listConceptPractice(course.id, 230))[0].unseenCount).toBe(1);
  expect(
    (await startConceptPractice(course.id, concept.id, { now: 240 })).selection.questionId,
  ).toBe('q2');
});

it('serves revised family prompts without requiring an unrelated generator version change', async () => {
  const course = await createCourse('Physics');
  const [set] = await importQuestionBank(familyExample, course.id);
  const conceptId = set.bank!.concepts[0].id;
  for (let i = 0; i < 6; i++) await startConceptPractice(course.id, conceptId, { now: 200 + i });
  expect((await listConceptPractice(course.id))[0].unseenCount).toBe(0);

  const revised = parseQuestionBank(familyExample);
  revised.bankVersion++;
  revised.families[0].template.questions[0].prompt += ' Explain the unit conversion.';
  await importQuestionBank(revised, course.id);
  expect((await listConceptPractice(course.id))[0].unseenCount).toBe(6);
  expect((await startConceptPractice(course.id, conceptId)).selection.novelty).toBe('unseen');
});

it('retains family exposure when only marking arithmetic and feedback change', async () => {
  const course = await createCourse('Physics');
  const [set] = await importQuestionBank(familyExample, course.id);
  const conceptId = set.bank!.concepts[0].id;
  await startConceptPractice(course.id, conceptId);
  const revised = parseQuestionBank(familyExample);
  revised.bankVersion++;
  revised.families[0].derived.push({ name: 'feedbackValue', op: '*', left: 'density', right: 2 });
  revised.families[0].template.questions[0].answer!.allocations[0].explanation =
    'Twice the density is {{feedbackValue}}.';
  await importQuestionBank(revised, course.id);
  expect((await listConceptPractice(course.id))[0]).toMatchObject({
    unseenCount: 5,
    familiarCount: 1,
  });
  expect(
    (await startConceptPractice(course.id, conceptId)).attempt.receipt.bank!.variant!.index,
  ).toBe(1);
});

it('excludes pure knowledge from application selection and replays only applicable marks in a mixed question', async () => {
  const { course, concept, set } = await fixture();
  const card = await createCard(course.id, 'front_back', 'Recall transport', 'Transport', [], {
    courseId: course.id,
    conceptId: concept.id,
  });
  const recall = structuredClone(set.questions[0]);
  recall.answer!.allocations[0].dimension = 'knowledge';
  await db.questionSets.clear();
  const saved = await createQuestionSet({ ...set, questions: [recall] });
  expect((await listConceptPractice(course.id))[0].availableCount).toBe(0);
  await expect(startConceptPractice(course.id, concept.id)).rejects.toThrow(/No questions/);
  let attempt = await startQuestionSetAttempt(saved.id, 'practice', 200);
  attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, recall.id, 210);
  attempt = await saveQuestionSetMarking(
    attempt.id,
    attempt.revisionId,
    {
      decisions: [{ allocationId: recall.answer!.allocations[0].id, status: 'awarded', marks: 0 }],
      annotations: [],
      corrections: [],
      reflection: { reasons: [], note: '' },
      activeNodeId: recall.id,
      activeAllocationId: null,
    },
    220,
  );
  attempt = await completeQuestionSetAttempt(attempt.id, attempt.revisionId, 230);
  expect(deriveConceptApplicationSchedules([attempt]).size).toBe(0);
  const application = {
    ...recall.answer!.allocations[0],
    id: 'apply',
    dimension: 'application' as const,
  };
  const mixed = await createQuestionSet({
    ...set,
    id: 'mixed-recall',
    questions: [
      {
        ...recall,
        prompt: 'Apply the recalled relationship to this new situation.',
        answer: {
          ...recall.answer!,
          maxMarks: 4,
          allocations: [...recall.answer!.allocations, application],
        },
      },
    ],
  });
  let started = (await startConceptPractice(course.id, concept.id, { now: 240 })).attempt;
  expect(started.receipt.questions[0].answer!.allocations).toHaveLength(2);
  started = await submitPracticeQuestion(started.id, started.revisionId, recall.id, 250);
  started = await saveQuestionSetMarking(
    started.id,
    started.revisionId,
    {
      decisions: [
        { allocationId: recall.answer!.allocations[0].id, status: 'awarded', marks: 0 },
        { allocationId: 'apply', status: 'awarded', marks: 2 },
      ],
      annotations: [],
      corrections: [],
      reflection: { reasons: [], note: '' },
      activeNodeId: recall.id,
      activeAllocationId: null,
    },
    260,
  );
  started = await completeQuestionSetAttempt(started.id, started.revisionId, 270);
  expect(started.questionSetId).toBe(mixed.id);
  expect(deriveConceptApplicationSchedules([attempt, started]).get(concept.id)).toEqual(
    scheduleQuestionReview(
      emptyQuestionSchedule(),
      3,
      started.firstMarking![0].schedulerConfig,
      270,
    ).schedule,
  );
  expect(await db.cards.get(card.id)).toEqual(card);
  expect(await db.reviewHistory.count()).toBe(0);
});
