import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createCourse } from '../db/courseRepository';
import { createConcept } from './repository';
import { createQuestionSet, updateQuestionSet } from './questionSetRepository';
import { listConceptPractice, startConceptPractice } from './conceptPractice';
import { mergeQuestionSetAttemptPair } from './questionSetAttemptMerge';
import {
  applyJevAllocationDecision,
  completeQuestionSetAttempt,
  saveQuestionSetResponseDraft,
  saveQuestionSetMarking,
  recordQuestionSetAssistance,
  submitPracticeQuestion,
  undoConceptPracticeAttempt,
} from './questionSetAttemptRepository';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it.each([
  { state: 'supported', expected: 'b-causal' },
  { state: 'knowledge-gap', expected: 'a-comparison' },
  { state: 'both-gaps', expected: 'b-causal' },
  { state: 'low-confidence', expected: 'a-comparison' },
  { state: 'assisted', expected: 'a-comparison' },
  { state: 'overridden', expected: 'a-comparison' },
  { state: 'corrected', expected: 'a-comparison' },
  { state: 'stale-content', expected: 'a-comparison' },
  { state: 'conflicting', expected: 'a-comparison' },
  { state: 'undone', expected: 'a-comparison' },
])('selects fresh technique practice from $state evidence', async ({ state, expected }) => {
  const course = await createCourse('Biology');
  const concept = await createConcept(course.id, 'Enzymes');
  const question = (id: string, techniques: Array<'causal-link' | 'paired-comparison'>) => ({
    id,
    prompt: `Explain and compare enzyme reactions ${id}`,
    parts: [],
    answer: {
      maxMarks: 1,
      response: { kind: 'written' as const },
      prerequisiteConceptIds: [],
      allocations: [
        {
          id: `${id}-mark`,
          criterion: 'Explain the difference in rates.',
          maxMarks: 1,
          dimension: 'application' as const,
          targetConceptIds: [concept.id],
          techniqueTags: {
            taxonomyId: 'science-techniques' as const,
            taxonomyVersion: 1 as const,
            techniqueIds: techniques,
            provenance: { source: 'author' as const },
          },
        },
      ],
    },
  });
  const evidence = await createQuestionSet({
    id: 'evidence',
    courseId: course.id,
    title: 'Original question',
    lessonIds: [],
    assessmentIds: [],
    questions: [question('original', ['causal-link', 'paired-comparison'])],
  });
  let { attempt } = await startConceptPractice(course.id, concept.id);
  await createQuestionSet({
    id: 'practice',
    courseId: course.id,
    title: 'Fresh practice',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      question('a-comparison', ['paired-comparison']),
      question('b-causal', ['causal-link']),
    ],
  });
  attempt = await saveQuestionSetResponseDraft(
    attempt.id,
    attempt.revisionId,
    'original',
    { kind: 'written', text: 'The first reaction is faster than the second.' },
    'original',
  );
  attempt = await submitPracticeQuestion(attempt.id, attempt.revisionId, 'original');
  if (state === 'assisted') {
    attempt = await recordQuestionSetAssistance(attempt.id, attempt.revisionId, {
      nodeId: 'original',
      kind: 'related-knowledge',
      occurredAt: Date.now(),
    });
  }
  await applyJevAllocationDecision(
    attempt.id,
    attempt.revisionId,
    'original',
    {
      allocationId: 'original-mark',
      status: 'awarded',
      marks: 0,
      markedBy: { by: 'jev', model: 'jev-1.14.0', confidence: 0.99, markedAt: Date.now() },
    },
    () => true,
    {
      taxonomyId: 'science-techniques',
      taxonomyVersion: 1,
      decisions: [
        {
          categoryId: 'knowledge',
          outcome: state === 'knowledge-gap' || state === 'both-gaps' ? 'gap' : 'no-gap',
          confidence: 0.99,
        },
        { categoryId: 'application', outcome: 'no-gap', confidence: 0.99 },
        {
          categoryId: 'causal-link',
          outcome: state === 'knowledge-gap' ? 'insufficient-evidence' : 'gap',
          confidence: state === 'low-confidence' ? 0.6 : 0.99,
        },
        { categoryId: 'paired-comparison', outcome: 'no-gap', confidence: 0.99 },
      ],
    },
  );
  const marked = (await db.questionSetAttempts.get(attempt.id))!;
  attempt = await completeQuestionSetAttempt(marked.id, marked.revisionId);
  if (state === 'overridden' || state === 'corrected') {
    await saveQuestionSetMarking(attempt.id, attempt.revisionId, {
      ...attempt,
      decisions:
        state === 'overridden'
          ? [{ ...attempt.decisions[0], status: 'awarded', marks: 1 }]
          : attempt.decisions,
      corrections:
        state === 'corrected'
          ? [
              {
                nodeId: 'original',
                content: 'The active site changed, reducing binding.',
                updatedAt: Date.now(),
              },
            ]
          : [],
    });
  }
  if (state === 'stale-content') {
    const {
      contentVersion: _version,
      contentRevisionId: _revision,
      createdAt: _created,
      updatedAt: _updated,
      ...content
    } = evidence;
    await updateQuestionSet(
      evidence.id,
      { ...content, title: 'Corrected authored question' },
      {
        expectedContentRevisionId: evidence.contentRevisionId,
      },
    );
  }
  if (state === 'conflicting') {
    const peer = structuredClone(attempt);
    peer.revisionId = 'peer-diagnostic-revision';
    peer.updatedAt += 1;
    peer.jevAssessmentReceipts![0].diagnosis.decisions[2].outcome = 'no-gap';
    await db.questionSetAttempts.put(mergeQuestionSetAttemptPair(attempt, peer));
  }
  if (state === 'undone') await undoConceptPracticeAttempt(attempt.id, attempt.revisionId);
  const practice = (await listConceptPractice(course.id)).find(
    (item) => item.conceptId === concept.id,
  )!;
  expect(practice.needs?.techniques ?? []).toEqual(
    state === 'supported' || state === 'both-gaps' ? ['causal-link'] : [],
  );
  expect(practice.needs?.knowledge ?? false).toBe(
    state === 'knowledge-gap' || state === 'both-gaps',
  );
  const next = await startConceptPractice(course.id, concept.id, { mode: 'mixed' });
  expect(next.selection.questionId).toBe(expected);
  expect(await db.reviewHistory.count()).toBe(0);
});
