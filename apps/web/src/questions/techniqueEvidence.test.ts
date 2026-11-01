import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import { createConcept } from './repository';
import { createQuestionSet } from './questionSetRepository';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import type { JevDiagnosis } from '@lacuna/core/jev/diagnosis';
import {
  applyJevAllocationDecision,
  completeQuestionSetAttempt,
  getQuestionSetAttempt,
  saveQuestionSetResponseDraft,
  startQuestionSetAttempt,
  submitPracticeQuestion,
} from './questionSetAttemptRepository';
import { startConceptPractice } from './conceptPractice';
import { deriveConceptDiagnosticEvidence, deriveConceptPracticeNeeds } from './techniqueEvidence';

let clock = 1_000;
beforeEach(async () => {
  clock = 1_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  db.close();
  await db.delete();
  await db.open();
});
afterEach(() => vi.restoreAllMocks());

async function fixture({
  single = false,
  ambiguous = false,
  oneQuestion = false,
}: { single?: boolean; ambiguous?: boolean; oneQuestion?: boolean } = {}) {
  const course = await createCourse('Biology');
  const concept = await createConcept(course.id, 'Enzymes');
  const other = await createConcept(course.id, 'Transport');
  const set = await createQuestionSet({
    id: 'evidence-set',
    courseId: course.id,
    title: 'Explanation evidence',
    lessonIds: [],
    assessmentIds: [],
    questions: (single || oneQuestion ? ['q1'] : ['q1', 'q2', 'q3']).map((id) => ({
      id,
      prompt: `Explain the mechanism in ${id}.`,
      parts: [],
      answer: {
        maxMarks: !single && id === 'q1' ? 2 : 1,
        response: { kind: 'written' },
        prerequisiteConceptIds: [],
        allocations: Array.from({ length: !single && id === 'q1' ? 2 : 1 }, (_, index) => ({
          id: `${id}-mark-${index}`,
          criterion: 'Links the mechanism to the consequence.',
          maxMarks: 1,
          dimension: 'application',
          targetConceptIds: ambiguous
            ? [concept.id, other.id]
            : [id === 'q3' ? other.id : concept.id],
          techniqueTags: {
            taxonomyId: 'science-techniques',
            taxonomyVersion: 1,
            techniqueIds: ['causal-link'],
            provenance: { source: 'author' },
          },
        })),
      },
    })),
  });
  return { course, concept, other, set };
}

async function mark(
  set: QuestionSetRecord,
  outcomes: Array<'gap' | 'no-gap'>,
  at: number,
  options: { conceptId?: string; uncertain?: 'low-confidence' | 'insufficient' } = {},
) {
  clock = at - 300;
  let attempt = options.conceptId
    ? (await startConceptPractice(set.courseId, options.conceptId)).attempt
    : await startQuestionSetAttempt(set.id, 'practice');
  for (const question of set.questions) {
    clock = at - 200;
    attempt = await saveQuestionSetResponseDraft(
      attempt.id,
      attempt.revisionId,
      question.id,
      { kind: 'written', text: 'The mechanism changes the rate because binding changes.' },
      question.id,
    );
  }
  for (const question of set.questions) {
    clock = at - 100;
    attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, question.id);
  }
  let index = 0;
  for (const question of set.questions) {
    for (const allocation of question.answer!.allocations) {
      clock = at + index;
      const diagnosis: JevDiagnosis = {
        taxonomyId: 'science-techniques',
        taxonomyVersion: 1,
        decisions: (['knowledge', 'application', 'causal-link'] as const).map((categoryId) => ({
          categoryId,
          confidence: options.uncertain === 'low-confidence' ? 0.6 : 0.99,
          outcome:
            options.uncertain === 'insufficient'
              ? 'insufficient-evidence'
              : categoryId === 'causal-link'
                ? outcomes[index]
                : 'no-gap',
        })),
      };
      await applyJevAllocationDecision(
        attempt.id,
        attempt.revisionId,
        question.id,
        {
          allocationId: allocation.id,
          status: 'awarded',
          marks: outcomes[index] === 'gap' ? 0 : 1,
          markedBy: { by: 'jev', model: 'jev-1.14.0', confidence: 0.99, markedAt: clock },
        },
        () => true,
        diagnosis,
      );
      attempt = (await getQuestionSetAttempt(attempt.id))!;
      index++;
    }
  }
  const beforeCompletion = attempt;
  clock = at + 100;
  attempt = await completeQuestionSetAttempt(attempt.id, attempt.revisionId);
  return { attempt, beforeCompletion };
}

it('counts independent question answers per Concept, merging correlated criteria with gap winning', async () => {
  const { set, concept, other } = await fixture();
  const first = (await mark(set, ['gap', 'no-gap', 'no-gap', 'gap'], 5_000)).attempt;
  const second = (await mark(set, ['no-gap', 'no-gap', 'no-gap', 'no-gap'], 7_000)).attempt;
  const evidence = deriveConceptDiagnosticEvidence([second, first, first], [set]);
  expect(evidence.get(concept.id)).toEqual([
    {
      categoryId: 'knowledge',
      demonstratedCount: 4,
      gapCount: 0,
      lastObservedAt: 7_002,
      latestOutcome: 'demonstrated',
    },
    {
      categoryId: 'application',
      demonstratedCount: 4,
      gapCount: 0,
      lastObservedAt: 7_002,
      latestOutcome: 'demonstrated',
    },
    {
      categoryId: 'causal-link',
      demonstratedCount: 3,
      gapCount: 1,
      lastObservedAt: 7_002,
      latestOutcome: 'demonstrated',
    },
  ]);
  expect(evidence.get(other.id)?.find((row) => row.categoryId === 'causal-link')).toEqual({
    categoryId: 'causal-link',
    demonstratedCount: 1,
    gapCount: 1,
    lastObservedAt: 7_003,
    latestOutcome: 'demonstrated',
  });
  expect(deriveConceptPracticeNeeds([first], [set]).get(concept.id)).toEqual({
    knowledge: false,
    application: false,
    techniques: [],
  });
});

it('retains the latest criterion need while counting a mixed-outcome answer conservatively', async () => {
  const { set, concept } = await fixture({ oneQuestion: true });
  const { attempt } = await mark(set, ['gap', 'no-gap'], 5_000);
  expect(
    deriveConceptDiagnosticEvidence([attempt], [set])
      .get(concept.id)
      ?.find((row) => row.categoryId === 'causal-link'),
  ).toEqual({
    categoryId: 'causal-link',
    demonstratedCount: 0,
    gapCount: 1,
    lastObservedAt: 5_001,
    latestOutcome: 'demonstrated',
  });
  expect(deriveConceptPracticeNeeds([attempt], [set]).get(concept.id)).toEqual({
    knowledge: false,
    application: false,
    techniques: [],
  });
});

it.each([
  'unfinished',
  'undone',
  'stale',
  'disputed',
  'first-marking-conflict',
  'competing-receipts',
  'assisted',
  'corrected',
  'overridden',
  'ambiguous',
  'low-confidence',
  'insufficient',
] as const)('withholds contextual evidence from %s observations', async (state) => {
  const { set, concept } = await fixture({ single: true, ambiguous: state === 'ambiguous' });
  const marked = await mark(set, ['gap'], 5_000, {
    conceptId: state === 'ambiguous' ? undefined : concept.id,
    uncertain: state === 'low-confidence' || state === 'insufficient' ? state : undefined,
  });
  const attempt = structuredClone(
    state === 'unfinished' ? marked.beforeCompletion : marked.attempt,
  );
  const currentSet = structuredClone(set);
  if (state === 'undone') attempt.undoneAt = attempt.completedAt;
  if (state === 'stale') currentSet.contentRevisionId = 'later-authoring-revision';
  if (state === 'disputed') attempt.disputedQuestionIds = ['q1'];
  if (state === 'first-marking-conflict')
    attempt.firstMarkingConflicts = [attempt.firstMarking![0]];
  if (state === 'competing-receipts') {
    const peer = structuredClone(attempt.jevAssessmentReceipts![0]);
    peer.diagnosis.decisions[2].outcome = 'no-gap';
    attempt.jevAssessmentReceipts!.push(peer);
  }
  if (state === 'assisted')
    attempt.assistance.push({ nodeId: 'q1', kind: 'related-knowledge', occurredAt: 4_950 });
  if (state === 'corrected')
    attempt.corrections.push({ nodeId: 'q1', content: 'Corrected mechanism.', updatedAt: 5_100 });
  if (state === 'overridden')
    attempt.decisions = [{ allocationId: 'q1-mark-0', status: 'awarded', marks: 1 }];
  expect(deriveConceptDiagnosticEvidence([attempt], [currentSet]).has(concept.id)).toBe(false);
  expect(deriveConceptPracticeNeeds([attempt], [currentSet]).get(concept.id)).toEqual(
    state === 'low-confidence' || state === 'insufficient'
      ? { knowledge: false, application: false, techniques: [] }
      : undefined,
  );
});
