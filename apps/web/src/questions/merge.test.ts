import { describe, expect, it } from 'vitest';
import { mergeQuestionAttempt } from './merge';
import type { QuestionAttempt } from './types';

function answeredAttempt(): QuestionAttempt {
  return {
    id: 'attempt-1',
    questionId: 'question-1',
    courseId: 'course-1',
    contentVersion: 1,
    contentRevisionId: 'content-1',
    scheduleEpochId: 'epoch-1',
    purpose: 'post-instruction',
    shownAt: 1,
    answeredAt: 2,
    updatedAt: 3,
    status: 'answered',
    receiptOrigin: 'native',
    renderedPrompt: 'What is 1 + 1?',
    resolvedPayload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
    renderedExplanation: 'One and one make two.',
    submittedAnswer: '2',
    marksEarned: 1,
    marksAvailable: 1,
    grade: 3,
    scheduleEffect: { kind: 'replay', grade: 3 },
    sessionId: 'session-1',
  };
}

describe('mergeQuestionAttempt', () => {
  it('rejects conflicting immutable corrections instead of inventing a winner', () => {
    const base = answeredAttempt();
    const left: QuestionAttempt = {
      ...base,
      correction: {
        submittedAt: 4,
        submittedAnswer: '2',
        marksEarned: 1,
        marksAvailable: 1,
      },
    };
    const right: QuestionAttempt = {
      ...base,
      updatedAt: 5,
      correction: {
        submittedAt: 5,
        submittedAnswer: '3',
        marksEarned: 0,
        marksAvailable: 1,
      },
    };

    expect(() => mergeQuestionAttempt(left, right)).toThrow(/conflicting immutable correction/i);
  });

  it('merges matching corrections and later undo lifecycle state', () => {
    const base = answeredAttempt();
    const correction = {
      submittedAt: 4,
      submittedAnswer: '2',
      marksEarned: 1,
      marksAvailable: 1,
    };

    expect(
      mergeQuestionAttempt(
        { ...base, correction },
        { ...base, correction, updatedAt: 6, undoneAt: 6 },
      ),
    ).toMatchObject({ correction, updatedAt: 6, undoneAt: 6 });
  });
});
