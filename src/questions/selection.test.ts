import { describe, expect, it } from 'vitest';
import type { QuestionAttempt, QuestionConceptSet, QuestionDefinition } from './types';
import { selectQuestionSession } from './selection';

const NOW = Date.UTC(2026, 7, 24, 12);

function question(
  id: string,
  options: {
    due?: number | null;
    kind?: 'fixed' | 'generated';
    suspended?: boolean;
  } = {},
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
    authoringUpdatedAt: NOW,
    scheduleEpoch: {
      id: `epoch-${id}`,
      startedAt: NOW,
      reason: 'created' as const,
      baseline: { kind: 'new' as const },
    },
    scheduleUpdatedAt: NOW,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0 as const,
    due: options.due ?? null,
    scheduledDays: 0,
    learningSteps: 0,
    createdAt: NOW,
    updatedAt: NOW,
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

function conceptSet(questionId: string, targetConceptId: string): QuestionConceptSet {
  return {
    questionId,
    courseId: 'course-1',
    targetConceptIds: [targetConceptId],
    prerequisiteConceptIds: [],
    authoringRevisionId: `authoring-${questionId}`,
    authoringUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function exposure(questionId: string, shownAt: number): QuestionAttempt {
  return {
    id: `attempt-${questionId}-${shownAt}`,
    questionId,
    courseId: 'course-1',
    contentVersion: 1,
    contentRevisionId: `content-${questionId}`,
    scheduleEpochId: `epoch-${questionId}`,
    purpose: 'post-instruction',
    shownAt,
    updatedAt: shownAt,
    status: 'shown',
    receiptOrigin: 'native',
    renderedPrompt: questionId,
    resolvedPayload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
    renderedExplanation: 'Because.',
    scheduleEffect: { kind: 'none' },
    sessionId: 'session-1',
  };
}

describe('selectQuestionSession', () => {
  it('takes overdue Questions by urgency before unseen Questions and excludes suspended items', () => {
    const questions = [
      question('unseen-fixed'),
      question('due-later', { due: NOW - 1_000 }),
      question('due-earlier', { due: NOW - 10_000 }),
      question('unseen-family', { kind: 'generated' }),
      question('suspended', { due: NOW - 20_000, suspended: true }),
    ];
    const sets = questions.map((item, index) => conceptSet(item.id, `concept-${index}`));

    expect(selectQuestionSession(questions, sets, [], { now: NOW }).map((item) => item.id)).toEqual(
      ['due-earlier', 'due-later', 'unseen-fixed', 'unseen-family'],
    );
  });

  it('caps default sessions at ten but All due returns every due Question', () => {
    const questions = Array.from({ length: 12 }, (_, index) =>
      question(`question-${index}`, { due: NOW - (12 - index) }),
    );
    const sets = questions.map((item, index) => conceptSet(item.id, `concept-${index}`));
    const attempts = questions.map((item) => exposure(item.id, NOW - 100_000));

    expect(selectQuestionSession(questions, sets, attempts, { now: NOW })).toHaveLength(10);
    expect(
      selectQuestionSession(questions, sets, attempts, { now: NOW, mode: 'all-due' }),
    ).toHaveLength(12);
  });

  it('avoids consecutive primary targets when another target remains at the same priority', () => {
    const questions = [
      question('a-early', { due: NOW - 4_000 }),
      question('a-late', { due: NOW - 3_000 }),
      question('b', { due: NOW - 2_000 }),
      question('a-last', { due: NOW - 1_000 }),
    ];
    const sets = [
      conceptSet('a-early', 'concept-a'),
      conceptSet('a-late', 'concept-a'),
      conceptSet('b', 'concept-b'),
      conceptSet('a-last', 'concept-a'),
    ];
    const attempts = questions.map((item) => exposure(item.id, NOW - 100_000));

    expect(
      selectQuestionSession(questions, sets, attempts, { now: NOW, mode: 'all-due' }).map(
        (item) => item.id,
      ),
    ).toEqual(['a-early', 'b', 'a-late', 'a-last']);
  });

  it('does not select an exposed Question before it is due', () => {
    const questions = [question('exposed-not-due', { due: NOW + 10_000 }), question('unseen')];
    const sets = questions.map((item, index) => conceptSet(item.id, `concept-${index}`));

    expect(
      selectQuestionSession(questions, sets, [exposure('exposed-not-due', NOW - 100)], {
        now: NOW,
      }).map((item) => item.id),
    ).toEqual(['unseen']);
  });

  it('rejects missing or non-primary target relationships instead of guessing', () => {
    const questions = [question('question-1')];

    expect(() => selectQuestionSession(questions, [], [], { now: NOW })).toThrow(/target concept/i);
    expect(() =>
      selectQuestionSession(
        questions,
        [
          {
            ...conceptSet('question-1', 'concept-1'),
            targetConceptIds: ['concept-1', 'concept-2'],
          },
        ],
        [],
        { now: NOW },
      ),
    ).toThrow(/exactly one target concept/i);
  });
});
