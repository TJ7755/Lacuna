import { describe, expect, it } from 'vitest';
import type { BackupAsset, BackupFile, CourseRecord } from '../db/types';
import { defaultFsrsParameters } from '../fsrs/params';
import type {
  Concept,
  FixedQuestionDefinition,
  QuestionAttempt,
  QuestionConceptSet,
} from '../questions/types';
import { mergeSnapshots } from './mergeSnapshots';
import type { QuestionSetRecord } from '../questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '../questions/questionSetAttempts';

const PARAMS = defaultFsrsParameters();

function course(overrides: Partial<CourseRecord> = {}): CourseRecord {
  return {
    id: 'course-1',
    name: 'Course',
    description: '',
    createdAt: 1,
    updatedAt: 1,
    fsrsVersion: 6,
    fsrsParameters: PARAMS,
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 14,
    practiceMaxGap: 2,
    ...overrides,
  };
}

function concept(): Concept {
  return {
    id: 'concept-1',
    scope: 'course',
    scopeKey: 'course:course-1',
    courseId: 'course-1',
    name: 'Addition',
    provisional: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

function question(
  revision = 'authoring-1',
  authoringUpdatedAt = 10,
  overrides: Partial<FixedQuestionDefinition> = {},
): FixedQuestionDefinition {
  return {
    id: 'question-1',
    courseId: 'course-1',
    primaryLessonId: null,
    additionalLessonIds: [],
    name: 'Addition',
    tags: [],
    suspended: false,
    kind: 'fixed',
    prompt: 'Calculate 1 + 1',
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
    explanation: 'One plus one is two.',
    explanationStatus: 'authored',
    contentVersion: 1,
    contentRevisionId: `content:${revision}`,
    authoringRevisionId: revision,
    authoringUpdatedAt,
    scheduleEpoch: {
      id: `epoch:${revision}`,
      startedAt: authoringUpdatedAt,
      reason: 'created',
      baseline: { kind: 'new' },
    },
    scheduleUpdatedAt: authoringUpdatedAt,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    createdAt: 1,
    updatedAt: authoringUpdatedAt,
    ...overrides,
  };
}

function links(revision = 'authoring-1', at = 10): QuestionConceptSet {
  return {
    questionId: 'question-1',
    courseId: 'course-1',
    targetConceptIds: ['concept-1'],
    prerequisiteConceptIds: [],
    authoringRevisionId: revision,
    authoringUpdatedAt: at,
    createdAt: 1,
    updatedAt: at,
  };
}

function attempt(overrides: Partial<QuestionAttempt> = {}): QuestionAttempt {
  return {
    id: 'attempt-1',
    questionId: 'question-1',
    courseId: 'course-1',
    contentVersion: 1,
    contentRevisionId: 'content:authoring-1',
    scheduleEpochId: 'epoch:authoring-1',
    purpose: 'post-instruction',
    shownAt: 20,
    updatedAt: 20,
    status: 'shown',
    receiptOrigin: 'native',
    renderedPrompt: 'Calculate 1 + 1',
    resolvedPayload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
    renderedExplanation: 'One plus one is two.',
    scheduleEffect: { kind: 'none' },
    sessionId: 'session-1',
    ...overrides,
  };
}

function backup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'lacuna',
    version: 11,
    exportedAt: 1,
    cards: [],
    concepts: [concept()],
    questions: [question()],
    questionConcepts: [links()],
    questionAttempts: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    courses: [course()],
    ...overrides,
  };
}

function asset(hash: string): BackupAsset {
  return {
    hash,
    data: 'Zg==',
    mimeType: 'image/png',
    kind: 'image',
    createdAt: 1,
  };
}

function authoredSet(prompt = 'Explain addition.'): QuestionSetRecord {
  return {
    id: 'set-1',
    courseId: 'course-1',
    title: 'Paper',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'set-question-1',
        prompt,
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'allocation-1',
              criterion: 'Explains it.',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: ['concept-1'],
            },
          ],
        },
      },
    ],
    contentVersion: 1,
    contentRevisionId: 'set-revision-1',
    createdAt: 1,
    updatedAt: 1,
  };
}

function setAttempt(overrides: Partial<QuestionSetAttemptRecord> = {}): QuestionSetAttemptRecord {
  return {
    id: 'set-attempt-1',
    courseId: 'course-1',
    questionSetId: 'set-1',
    receipt: authoredSet(),
    mode: 'paper',
    status: 'answering',
    responses: [{ nodeId: 'set-question-1', draft: { kind: 'written', text: '' } }],
    decisions: [],
    annotations: [],
    corrections: [],
    reflection: { reasons: [], note: '' },
    assistance: [],
    revealedQuestionIds: [],
    activeNodeId: 'set-question-1',
    activeAllocationId: null,
    revisionId: 'attempt-revision-1',
    createdAt: 20,
    updatedAt: 20,
    ...overrides,
  };
}

describe('Question peer merge', () => {
  it('selects the coherent authored bundle without letting a newer schedule revert content', () => {
    const oldQuestion = question('old', 10, {
      prompt: 'Old prompt',
      scheduleUpdatedAt: 1_000,
      updatedAt: 1_000,
    });
    const newQuestion = question('new', 20, { prompt: 'New prompt' });

    const merged = mergeSnapshots(
      backup({ questions: [oldQuestion], questionConcepts: [links('old', 10)] }),
      backup({ questions: [newQuestion], questionConcepts: [links('new', 20)] }),
    );

    expect(merged.questions).toEqual([
      expect.objectContaining({ prompt: 'New prompt', authoringRevisionId: 'new' }),
    ]);
    expect(merged.questionConcepts).toEqual([
      expect.objectContaining({ authoringRevisionId: 'new' }),
    ]);
  });

  it('unions attempt lifecycle state and replays the winning epoch schedule', () => {
    const shown = attempt();
    const answered = attempt({
      status: 'answered',
      answeredAt: 30,
      updatedAt: 30,
      submittedAnswer: '2',
      marksEarned: 1,
      marksAvailable: 1,
      grade: 3,
      scheduleEffect: { kind: 'replay', grade: 3 },
    });

    const merged = mergeSnapshots(
      backup({ questionAttempts: [shown] }),
      backup({ questionAttempts: [answered] }),
    );

    expect(merged.questionAttempts).toEqual([
      expect.objectContaining({ id: 'attempt-1', status: 'answered', submittedAnswer: '2' }),
    ]);
    expect(merged.questions[0]).toMatchObject({ reps: 1, lastReviewed: 30 });

    const undone = mergeSnapshots(
      merged,
      backup({ questionAttempts: [{ ...answered, undoneAt: 50, updatedAt: 50 }] }),
    );
    expect(undone.questionAttempts[0].undoneAt).toBe(50);
    expect(undone.questions[0]).toMatchObject({ reps: 0, lastReviewed: null });
  });

  it('fails closed when one attempt identity carries a different immutable receipt', () => {
    expect(() =>
      mergeSnapshots(
        backup({ questionAttempts: [attempt()] }),
        backup({ questionAttempts: [attempt({ renderedPrompt: 'A different presentation' })] }),
      ),
    ).toThrow(/immutable Question attempt receipt/i);
  });

  it('retains attempt evidence and its assets after a Question is deleted', () => {
    const hash = 'a'.repeat(64);
    const retained = attempt({ renderedExplanation: `![worked](${`lacuna-asset://${hash}`})` });
    const merged = mergeSnapshots(
      backup({ questionAttempts: [retained], assets: [asset(hash)] }),
      backup({
        questions: [],
        questionConcepts: [],
        questionAttempts: [retained],
        assets: [asset(hash)],
        tombstones: [{ table: 'questions', recordId: 'question-1', deletedAt: 50 }],
      }),
    );

    expect(merged.questions).toEqual([]);
    expect(merged.questionConcepts).toEqual([]);
    expect(merged.questionAttempts).toEqual([retained]);
    expect(merged.assets.map((row) => row.hash)).toEqual([hash]);
  });

  it('drops Question definitions and attempts when their Course is deleted', () => {
    const merged = mergeSnapshots(
      backup({ questionAttempts: [attempt()] }),
      backup({
        courses: [],
        tombstones: [{ table: 'courses', recordId: 'course-1', deletedAt: 50 }],
      }),
    );

    expect(merged.courses).toEqual([]);
    expect(merged.questions).toEqual([]);
    expect(merged.questionConcepts).toEqual([]);
    expect(merged.questionAttempts).toEqual([]);
  });

  it('retains Question Set attempt receipt media after authored content is deleted', () => {
    const hash = 'b'.repeat(64);
    const receipt = authoredSet(`Explain addition. ![diagram](lacuna-asset://${hash})`);
    const retained = setAttempt({ receipt });
    const merged = mergeSnapshots(
      backup({ questionSets: [receipt], questionSetAttempts: [retained], assets: [asset(hash)] }),
      backup({
        questionSets: [],
        questionSetAttempts: [retained],
        assets: [asset(hash)],
        tombstones: [{ table: 'questionSets', recordId: receipt.id, deletedAt: 50 }],
      }),
    );
    expect(merged.questionSets).toEqual([]);
    expect(merged.questionSetAttempts).toEqual([retained]);
    expect(merged.assets.map((row) => row.hash)).toEqual([hash]);
  });

  it('fails closed on conflicting Question Set attempt receipts or submitted originals', () => {
    const submitted = setAttempt({
      responses: [
        {
          nodeId: 'set-question-1',
          draft: { kind: 'written', text: 'One' },
          submitted: { kind: 'written', text: 'One' },
          submittedAt: 30,
        },
      ],
    });
    expect(() =>
      mergeSnapshots(
        backup({ questionSetAttempts: [submitted] }),
        backup({ questionSetAttempts: [setAttempt({ receipt: authoredSet('Different prompt') })] }),
      ),
    ).toThrow(/conflicting immutable receipts/i);
    expect(() =>
      mergeSnapshots(
        backup({ questionSetAttempts: [submitted] }),
        backup({
          questionSetAttempts: [
            setAttempt({
              revisionId: 'competing-response',
              responses: [
                {
                  nodeId: 'set-question-1',
                  draft: { kind: 'written', text: 'Two' },
                  submitted: { kind: 'written', text: 'Two' },
                  submittedAt: 30,
                },
              ],
            }),
          ],
        }),
      ),
    ).toThrow(/conflicting submitted responses/i);
  });

  it('does not let a later stale edit regress a completed Question Set attempt', () => {
    const completed = setAttempt({
      status: 'complete',
      responses: [
        {
          nodeId: 'set-question-1',
          draft: { kind: 'written', text: 'Answer' },
          submitted: { kind: 'written', text: 'Answer' },
          submittedAt: 30,
        },
      ],
      decisions: [{ allocationId: 'allocation-1', status: 'awarded', marks: 0 }],
      revealedQuestionIds: ['set-question-1'],
      paperSubmittedAt: 30,
      completedAt: 40,
      revisionId: 'completed',
      updatedAt: 40,
    });
    const stale = setAttempt({ revisionId: 'stale-later', updatedAt: 50 });
    const merged = mergeSnapshots(
      backup({ questionSetAttempts: [completed] }),
      backup({ questionSetAttempts: [stale] }),
    );
    expect(merged.questionSetAttempts[0]).toMatchObject({ status: 'complete', completedAt: 40 });
  });

  it('deterministically unions concurrent Practice submissions, reveals and assistance', () => {
    const first = authoredSet();
    const secondQuestion = structuredClone(first.questions[0]);
    secondQuestion.id = 'set-question-2';
    secondQuestion.answer!.allocations[0].id = 'allocation-2';
    const receipt = { ...first, questions: [first.questions[0], secondQuestion] };
    const baseResponses: QuestionSetAttemptRecord['responses'] = [
      { nodeId: 'set-question-1', draft: { kind: 'written', text: 'One' } },
      { nodeId: 'set-question-2', draft: { kind: 'written', text: 'Two' } },
    ];
    const left = setAttempt({
      receipt,
      mode: 'practice',
      revisionId: 'left',
      updatedAt: 30,
      responses: [
        { ...baseResponses[0], submitted: baseResponses[0].draft, submittedAt: 30 },
        baseResponses[1],
      ],
      revealedQuestionIds: ['set-question-1'],
      assistance: [{ nodeId: 'set-question-1', kind: 'related-knowledge', occurredAt: 25 }],
    });
    const right = setAttempt({
      receipt,
      mode: 'practice',
      revisionId: 'right',
      updatedAt: 31,
      responses: [
        baseResponses[0],
        { ...baseResponses[1], submitted: baseResponses[1].draft, submittedAt: 31 },
      ],
      revealedQuestionIds: ['set-question-2'],
      assistance: [{ nodeId: 'set-question-2', kind: 'answer-revealed', occurredAt: 26 }],
    });
    const merged = mergeSnapshots(
      backup({ questionSetAttempts: [left] }),
      backup({ questionSetAttempts: [right] }),
    );
    const reversed = mergeSnapshots(
      backup({ questionSetAttempts: [right] }),
      backup({ questionSetAttempts: [left] }),
    );
    expect(merged.questionSetAttempts).toEqual(reversed.questionSetAttempts);
    expect(merged.questionSetAttempts[0]).toMatchObject({
      status: 'marking',
      revealedQuestionIds: ['set-question-1', 'set-question-2'],
      assistance: [
        { nodeId: 'set-question-1', kind: 'related-knowledge' },
        { nodeId: 'set-question-2', kind: 'answer-revealed' },
      ],
    });
    expect(mergeSnapshots(merged, merged)).toEqual(merged);
  });
});
