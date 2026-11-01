import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionAttempt } from '../../questions/types';
import { QuestionFeedback } from './QuestionFeedback';

function answeredAttempt(overrides: Partial<QuestionAttempt> = {}): QuestionAttempt {
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
    updatedAt: 2,
    status: 'answered',
    receiptOrigin: 'native',
    renderedPrompt: 'Solve 2 + 2.',
    resolvedPayload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
    renderedExplanation: 'Add the quantities. **The answer is 4.**',
    submittedAnswer: '5',
    marksEarned: 0,
    marksAvailable: 1,
    grade: 1,
    scheduleEffect: { kind: 'replay', grade: 1 },
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('QuestionFeedback', () => {
  it('shows worked feedback and records a correction separately from first-submission marks', () => {
    const onCorrection = vi.fn();
    render(
      <QuestionFeedback
        attempt={answeredAttempt()}
        onCorrection={onCorrection}
        onNext={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText('0 / 1 marks')).toBeInTheDocument();
    expect(screen.getByText(/The answer is 4/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record an optional correction' }));
    fireEvent.change(screen.getByLabelText('Corrected answer'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record correction' }));

    expect(onCorrection).toHaveBeenCalledWith({
      submittedAnswer: '4',
      marksEarned: 1,
      marksAvailable: 1,
      lineVerdicts: undefined,
    });
  });

  it('states that checker disputes withhold scheduling while retaining evidence', () => {
    render(
      <QuestionFeedback
        attempt={answeredAttempt({
          checkerDisputes: [
            {
              reportedAt: 2,
              question: 'Solve 2 + 2.',
              studentLine: '5',
              verdict: { correct: false, marksEarned: 0 },
              checkerSeeds: [],
            },
          ],
          grade: undefined,
          scheduleEffect: { kind: 'none' },
        })}
        onCorrection={vi.fn()}
        onNext={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText('Checker review needed')).toBeInTheDocument();
    expect(screen.getByText(/has not changed this Question’s schedule/)).toBeInTheDocument();
  });
});
