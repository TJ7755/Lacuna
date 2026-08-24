import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionAttempt } from '../../questions/types';
import { QuestionResponsePanel, checkQuestionAnswer } from './QuestionResponsePanel';

function attempt(overrides: Partial<QuestionAttempt> = {}): QuestionAttempt {
  return {
    id: 'attempt-1',
    questionId: 'question-1',
    courseId: 'course-1',
    contentVersion: 1,
    contentRevisionId: 'content-1',
    scheduleEpochId: 'epoch-1',
    purpose: 'post-instruction',
    shownAt: 1,
    updatedAt: 1,
    status: 'shown',
    receiptOrigin: 'native',
    renderedPrompt: 'Solve **2 + 2**.',
    resolvedPayload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
    renderedExplanation: 'Add the two quantities: $2 + 2 = 4$.',
    scheduleEffect: { kind: 'none' },
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('checkQuestionAnswer', () => {
  it('returns raw numeric marks without choosing an FSRS grade in the UI', () => {
    expect(
      checkQuestionAnswer(
        { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
        '4',
        'seed',
      ),
    ).toEqual({ answer: '4', marksEarned: 1, marksAvailable: 1 });
  });

  it('retains per-line working verdicts and partial marks', () => {
    const result = checkQuestionAnswer(
      {
        v: 1,
        kind: 'working',
        scheme: [
          { marks: 1, kind: 'predicate', predicate: 'equals', args: ['4'] },
          { marks: 1, kind: 'predicate', predicate: 'equals', args: ['8'] },
        ],
      },
      '4\n7',
      'seed',
    );
    expect(result?.marksEarned).toBe(1);
    expect(result?.marksAvailable).toBe(2);
    expect(result?.lineVerdicts).toHaveLength(2);
  });
});

describe('QuestionResponsePanel', () => {
  it('lets the learner inspect and dispute a checker verdict before evidence is recorded', () => {
    const onSubmit = vi.fn();
    render(<QuestionResponsePanel attempt={attempt()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));

    expect(screen.getByLabelText('Checker result')).toHaveTextContent('0 / 1 marks');
    fireEvent.click(screen.getByRole('button', { name: 'Checker got this wrong' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show worked feedback' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        submittedAnswer: '5',
        marksEarned: 0,
        marksAvailable: 1,
        checkerDisputes: [expect.objectContaining({ studentLine: '5' })],
      }),
    );
  });
});
