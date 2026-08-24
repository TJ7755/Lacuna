import { describe, expect, it } from 'vitest';
import type { QuestionAttempt, QuestionDefinition, QuestionPayload } from './types';
import { buildQuestionAnalytics } from './analytics';

const NOW = 10_000;

function question(
  id: string,
  options: { kind?: 'fixed' | 'generated'; due?: number | null; suspended?: boolean } = {},
): QuestionDefinition {
  const common = {
    id,
    courseId: 'course-1',
    primaryLessonId: null,
    additionalLessonIds: [],
    name: id,
    tags: [],
    suspended: options.suspended ?? false,
    contentVersion: 1,
    contentRevisionId: `content-${id}`,
    authoringRevisionId: `authoring-${id}`,
    authoringUpdatedAt: 1,
    scheduleEpoch: {
      id: `epoch-${id}`,
      startedAt: 1,
      reason: 'created' as const,
      baseline: { kind: 'new' as const },
    },
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0 as const,
    due: options.due ?? null,
    scheduledDays: 0,
    learningSteps: 0,
    scheduleUpdatedAt: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  return options.kind === 'generated'
    ? {
        ...common,
        kind: 'generated',
        generatorKey: 'integer-root-quadratic',
        generatorVersion: 1,
        generatorConfig: {},
      }
    : {
        ...common,
        kind: 'fixed',
        prompt: id,
        payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
        explanation: 'Because.',
        explanationStatus: 'authored',
      };
}

function attempt(
  id: string,
  questionId: string,
  shownAt: number,
  options: {
    status?: 'shown' | 'answered' | 'abandoned';
    grade?: 1 | 3;
    marksEarned?: number;
    marksAvailable?: number;
    undone?: boolean;
    dispute?: boolean;
    fingerprint?: string;
    contentVersion?: number;
    payload?: QuestionPayload;
    lineVerdicts?: QuestionAttempt['lineVerdicts'];
  } = {},
): QuestionAttempt {
  const status = options.status ?? 'answered';
  const payload = options.payload ?? {
    v: 1 as const,
    kind: 'numeric' as const,
    answer: { kind: 'exact' as const, value: '1' },
  };
  return {
    id,
    questionId,
    courseId: 'course-1',
    contentVersion: options.contentVersion ?? 1,
    contentRevisionId: `content-${questionId}-${options.contentVersion ?? 1}`,
    scheduleEpochId: `epoch-${questionId}`,
    purpose: 'post-instruction',
    shownAt,
    ...(status === 'answered' ? { answeredAt: shownAt + 1 } : {}),
    ...(status === 'abandoned' ? { abandonedAt: shownAt + 1 } : {}),
    ...(options.undone ? { undoneAt: shownAt + 2 } : {}),
    updatedAt: shownAt + 2,
    status,
    receiptOrigin: 'native',
    renderedPrompt: questionId,
    resolvedPayload: payload,
    renderedExplanation: 'Because.',
    ...(status === 'answered' ? { submittedAnswer: 'answer' } : {}),
    marksEarned: options.marksEarned,
    marksAvailable: options.marksAvailable,
    lineVerdicts: options.lineVerdicts,
    ...(options.dispute
      ? {
          checkerDisputes: [
            {
              reportedAt: shownAt + 1,
              question: questionId,
              studentLine: 'answer',
              verdict: { correct: false, marksEarned: 0 },
              checkerSeeds: [],
            },
          ],
        }
      : {}),
    grade: options.grade,
    ...(options.fingerprint
      ? {
          generatorKey: 'integer-root-quadratic',
          generatorVersion: 1,
          seed: id,
          parameters: {},
          generatorFingerprint: options.fingerprint,
        }
      : {}),
    scheduleEffect: options.grade ? { kind: 'replay', grade: options.grade } : { kind: 'none' },
    sessionId: 'session-1',
  };
}

describe('buildQuestionAnalytics', () => {
  it('excludes non-evidence and checker-withheld attempts without turning them into failures', () => {
    const fixedA = question('fixed-a');
    const fixedB = question('fixed-b');
    const result = buildQuestionAnalytics(
      [fixedA, fixedB],
      [
        attempt('shown-first', fixedA.id, 1, { status: 'shown' }),
        attempt('repeat-correct', fixedA.id, 2, {
          grade: 3,
          marksEarned: 1,
          marksAvailable: 1,
        }),
        attempt('first-wrong', fixedB.id, 3, {
          grade: 1,
          marksEarned: 0,
          marksAvailable: 1,
        }),
        attempt('abandoned', fixedB.id, 4, { status: 'abandoned' }),
        attempt('undone', fixedB.id, 5, {
          grade: 1,
          marksEarned: 0,
          marksAvailable: 1,
          undone: true,
        }),
        attempt('disputed', fixedB.id, 6, {
          marksEarned: 0,
          marksAvailable: 1,
          dispute: true,
        }),
        attempt('ungraded', fixedB.id, 7, { marksEarned: 0, marksAvailable: 1 }),
        attempt('missing-marks', fixedB.id, 8, { grade: 3 }),
      ],
      NOW,
    );

    expect(result.fixed.firstPresentation).toMatchObject({
      attemptCount: 1,
      fullCreditCount: 0,
      accuracy: 0,
    });
    expect(result.fixed.repeat).toMatchObject({
      attemptCount: 1,
      fullCreditCount: 1,
      accuracy: 1,
    });
    expect(result.excluded).toEqual({
      shown: 1,
      abandoned: 1,
      undone: 1,
      checkerWithheld: 2,
      unscored: 1,
    });
  });

  it('uses presentation history for generated novelty while keeping accuracy evidence clean', () => {
    const generated = question('family', { kind: 'generated' });
    const result = buildQuestionAnalytics(
      [generated],
      [
        attempt('a-first', generated.id, 1, {
          fingerprint: 'variant-a',
          grade: 3,
          marksEarned: 2,
          marksAvailable: 2,
        }),
        attempt('a-repeat', generated.id, 2, {
          fingerprint: 'variant-a',
          grade: 1,
          marksEarned: 0,
          marksAvailable: 2,
        }),
        attempt('b-shown', generated.id, 3, {
          fingerprint: 'variant-b',
          status: 'shown',
        }),
        attempt('b-repeat', generated.id, 4, {
          fingerprint: 'variant-b',
          grade: 3,
          marksEarned: 2,
          marksAvailable: 2,
        }),
      ],
      NOW,
    );

    expect(result.generated).toMatchObject({
      uniqueVariantCount: 2,
      presentationCount: 4,
      repeatedPresentationCount: 2,
      repeatRate: 0.5,
    });
    expect(result.generated.novel).toMatchObject({ attemptCount: 1, accuracy: 1 });
    expect(result.generated.repeated).toMatchObject({ attemptCount: 2, accuracy: 0.5 });
  });

  it('keeps criterion identities separate across content versions and includes index and label', () => {
    const fixed = question('working');
    const v1Payload: QuestionPayload = {
      v: 1,
      kind: 'working',
      scheme: [
        { marks: 1, label: 'Substitution', kind: 'predicate', predicate: 'equals', args: ['4'] },
      ],
    };
    const v2Payload: QuestionPayload = {
      v: 1,
      kind: 'working',
      scheme: [{ marks: 1, label: 'Method', kind: 'predicate', predicate: 'equals', args: ['4'] }],
    };
    const result = buildQuestionAnalytics(
      [fixed],
      [
        attempt('v1', fixed.id, 1, {
          contentVersion: 1,
          payload: v1Payload,
          grade: 3,
          marksEarned: 1,
          marksAvailable: 1,
          lineVerdicts: [{ studentLine: '4', matchedLineIndex: 0, marksEarned: 1 }],
        }),
        attempt('v2', fixed.id, 2, {
          contentVersion: 2,
          payload: v2Payload,
          grade: 1,
          marksEarned: 0,
          marksAvailable: 1,
          lineVerdicts: [{ studentLine: '5', matchedLineIndex: null, marksEarned: 0 }],
        }),
      ],
      NOW,
    );

    expect(result.criteria).toEqual([
      expect.objectContaining({
        id: 'working:v1:criterion:0:Substitution',
        contentVersion: 1,
        lineIndex: 0,
        label: 'Substitution',
        opportunityCount: 1,
        fullCreditCount: 1,
      }),
      expect.objectContaining({
        id: 'working:v2:criterion:0:Method',
        contentVersion: 2,
        lineIndex: 0,
        label: 'Method',
        opportunityCount: 1,
        fullCreditCount: 0,
      }),
    ]);
  });

  it('reports inventory and fixed exposure coverage from all presentations', () => {
    const due = question('due', { due: NOW - 1 });
    const unseen = question('unseen');
    const suspended = question('suspended', { suspended: true, due: NOW - 2 });
    const result = buildQuestionAnalytics(
      [due, unseen, suspended],
      [attempt('due-shown', due.id, 1, { status: 'shown' })],
      NOW,
    );

    expect(result.inventory).toEqual({ total: 3, due: 1, unseen: 2, suspended: 1 });
    expect(result.fixed).toMatchObject({
      definitionCount: 3,
      presentedDefinitionCount: 1,
      exposureCoverage: 1 / 3,
    });
  });
});
