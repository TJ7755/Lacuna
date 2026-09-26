import { describe, expect, it } from 'vitest';
import type { QuestionSetRecord } from './questionSetCodec';
import type { QuestionSetAttemptRecord } from './questionSetAttempts';
import { summariseQuestionSetEvidence } from './questionSetEvidence';

function set(): QuestionSetRecord {
  return {
    id: 'set-1',
    courseId: 'course-1',
    title: 'Paper',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'q1',
        prompt: 'Explain.',
        parts: [],
        answer: {
          maxMarks: 3,
          response: { kind: 'written' },
          prerequisiteConceptIds: ['prerequisite'],
          allocations: [
            {
              id: 'a1',
              criterion: 'Knowledge',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: ['concept-a', 'concept-b'],
            },
            {
              id: 'a2',
              criterion: 'Apply',
              maxMarks: 2,
              dimension: 'application',
              targetConceptIds: ['concept-a'],
            },
          ],
        },
      },
    ],
    contentVersion: 1,
    contentRevisionId: 'revision-1',
    createdAt: 1,
    updatedAt: 1,
  };
}

function attempt(overrides: Partial<QuestionSetAttemptRecord> = {}): QuestionSetAttemptRecord {
  const receipt = set();
  return {
    id: 'attempt-1',
    courseId: receipt.courseId,
    questionSetId: receipt.id,
    receipt,
    mode: 'practice',
    status: 'answering',
    responses: [{ nodeId: 'q1', draft: { kind: 'written', text: '' } }],
    decisions: [],
    annotations: [],
    corrections: [],
    reflection: { reasons: [], note: '' },
    assistance: [],
    revealedQuestionIds: [],
    activeNodeId: 'q1',
    activeAllocationId: null,
    revisionId: 'attempt-revision',
    createdAt: 10,
    updatedAt: 10,
    ...overrides,
  };
}

describe('Question Set descriptive evidence', () => {
  it('keeps unsubmitted and unresolved marks distinct from zero', () => {
    const unsubmitted = attempt();
    const submitted = attempt({
      id: 'attempt-2',
      status: 'marking',
      createdAt: 20,
      updatedAt: 20,
      responses: [
        {
          nodeId: 'q1',
          draft: { kind: 'written', text: 'Answer' },
          submitted: { kind: 'written', text: 'Answer' },
          submittedAt: 20,
        },
      ],
      decisions: [
        { allocationId: 'a1', status: 'awarded', marks: 0 },
        { allocationId: 'a2', status: 'unsure' },
      ],
      assistance: [{ nodeId: 'q1', kind: 'related-knowledge', occurredAt: 19 }],
    });
    const summary = summariseQuestionSetEvidence({
      courseId: 'course-1',
      currentSets: [set()],
      attempts: [unsubmitted, submitted],
    });
    expect(summary.sets[0].all).toMatchObject({
      attempts: 2,
      answering: 1,
      provisional: 1,
      completed: 0,
      assisted: 1,
      marks: { earned: 0, available: 3, unresolvedAvailable: 2 },
    });
    expect(summary.sets[0].all.dimensions.knowledge).toEqual({
      earned: 0,
      available: 1,
      unresolvedAvailable: 0,
    });
    expect(summary.sets[0].all.dimensions.application).toEqual({
      earned: 0,
      available: 2,
      unresolvedAvailable: 2,
    });
  });

  it('partitions first-recorded and repeated attempts without duplicating multi-concept marks', () => {
    const first = attempt({
      status: 'complete',
      completedAt: 12,
      updatedAt: 12,
      responses: [
        {
          nodeId: 'q1',
          draft: { kind: 'written', text: 'First' },
          submitted: { kind: 'written', text: 'First' },
          submittedAt: 11,
        },
      ],
      decisions: [
        { allocationId: 'a1', status: 'awarded', marks: 1 },
        { allocationId: 'a2', status: 'awarded', marks: 1 },
      ],
      revealedQuestionIds: ['q1'],
    });
    const repeated = attempt({
      ...first,
      id: 'attempt-2',
      createdAt: 20,
      updatedAt: 22,
      completedAt: 22,
      revisionId: 'repeat',
    });
    const row = summariseQuestionSetEvidence({
      courseId: 'course-1',
      currentSets: [set()],
      attempts: [repeated, first],
    }).sets[0];
    expect(row.firstRecorded).toMatchObject({
      attempts: 1,
      completed: 1,
      marks: { earned: 2, available: 3 },
    });
    expect(row.repeated).toMatchObject({
      attempts: 1,
      completed: 1,
      marks: { earned: 2, available: 3 },
    });
    expect(row.all.marks).toEqual({ earned: 4, available: 6, unresolvedAvailable: 0 });
  });

  it('uses pinned receipts for history, ignores corrections, and reports current coverage separately', () => {
    const historical = set();
    historical.questions[0].answer!.allocations[0].maxMarks = 2;
    historical.questions[0].answer!.allocations[1].maxMarks = 1;
    const completed = attempt({
      receipt: historical,
      status: 'complete',
      completedAt: 12,
      updatedAt: 12,
      responses: [
        {
          nodeId: 'q1',
          draft: { kind: 'written', text: 'Original' },
          submitted: { kind: 'written', text: 'Original' },
          submittedAt: 11,
        },
      ],
      decisions: [
        { allocationId: 'a1', status: 'awarded', marks: 2 },
        { allocationId: 'a2', status: 'awarded', marks: 0 },
      ],
      corrections: [{ nodeId: 'q1', content: 'Perfect correction', updatedAt: 12 }],
      revealedQuestionIds: ['q1'],
    });
    const summary = summariseQuestionSetEvidence({
      courseId: 'course-1',
      currentSets: [set()],
      attempts: [completed],
    });
    expect(summary.sets[0].all.marks).toEqual({ earned: 2, available: 3, unresolvedAvailable: 0 });
    expect(summary.coverage).toEqual({
      targetConceptIds: ['concept-a', 'concept-b'],
      prerequisiteConceptIds: ['prerequisite'],
    });
  });

  it('retains deleted-set history with a null current title and filters other Courses', () => {
    const retained = attempt();
    const other = attempt({ id: 'other', courseId: 'course-2' });
    const summary = summariseQuestionSetEvidence({
      courseId: 'course-1',
      currentSets: [],
      attempts: [retained, other],
    });
    expect(summary.sets).toEqual([
      expect.objectContaining({ questionSetId: 'set-1', title: null }),
    ]);
    expect(summary.coverage).toEqual({ targetConceptIds: [], prerequisiteConceptIds: [] });
  });
});
