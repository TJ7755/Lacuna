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
    fireEvent.click(screen.getByRole('button', { name: 'Marked unfairly?' }));
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

  it('lets the learner return from checked working to edit the same answer', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionResponsePanel
        attempt={attempt({
          resolvedPayload: {
            v: 1,
            kind: 'working',
            scheme: [{ marks: 1, kind: 'predicate', predicate: 'equals', args: ['4'] }],
          },
        })}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Your working'), { target: { value: '2 + 2 = 5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check working' }));

    const result = screen.getByLabelText('Checker result');
    expect(result).toBeInTheDocument();
    expect(result.parentElement).toHaveStyle({ opacity: '0' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit answer' }));

    expect(screen.getByLabelText('Your working')).toHaveValue('2 + 2 = 5');
    expect(screen.queryByLabelText('Checker result')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('offers New numbers only for generated families and highlights their values', () => {
    const onReroll = vi.fn();
    const generated = attempt({
      renderedPrompt: 'A cell is 12 mm long.',
      parameters: { length: 12 },
    });
    const { rerender } = render(<QuestionResponsePanel attempt={generated} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'New numbers' })).not.toBeInTheDocument();

    rerender(<QuestionResponsePanel attempt={generated} onSubmit={vi.fn()} onReroll={onReroll} />);
    fireEvent.click(screen.getByRole('button', { name: 'New numbers' }));
    expect(onReroll).toHaveBeenCalledTimes(1);
    expect(screen.getByText('12').tagName).toBe('STRONG');
  });

  it('marks a wrong check with the wrong tone and a full-marks check with the right tone', () => {
    const { container } = render(
      <QuestionResponsePanel attempt={attempt()} onSubmit={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(container.querySelector('[data-result-tone="right"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit answer' }));
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(container.querySelector('[data-result-tone="wrong"]')).not.toBeNull();
  });
});
