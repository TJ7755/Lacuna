import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Card, ItemPayload } from '../../db/types';
import { NumericStudyFace } from './NumericStudyFace';
import { WorkingStudyFace } from './WorkingStudyFace';

function card(payload: ItemPayload): Card {
  return {
    id: 'card-1',
    conceptId: 'concept-1',
    schedulingUnitId: 'course-1',
    courseId: 'course-1',
    primaryLessonId: null,
    type: 'front_back',
    front: 'Solve 2 + 2.',
    back: '',
    payload,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('machine-marked study faces', () => {
  it('animates a numeric answer into its checker result', () => {
    const numericCard = card({
      v: 1,
      kind: 'numeric',
      answer: { kind: 'exact', value: '4' },
    }) as Card & { payload: Extract<ItemPayload, { kind: 'numeric' }> };

    render(<NumericStudyFace card={numericCard} onAnswer={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));

    const result = screen.getByLabelText('Checker result');
    expect(result.parentElement).toHaveStyle({ opacity: '0' });
  });

  it('animates checked working and lets the learner edit it before continuing', () => {
    const workingCard = card({
      v: 1,
      kind: 'working',
      scheme: [{ marks: 1, kind: 'predicate', predicate: 'equals', args: ['4'] }],
    }) as Card & { payload: Extract<ItemPayload, { kind: 'working' }> };
    const onAnswer = vi.fn();

    render(<WorkingStudyFace card={workingCard} onAnswer={onAnswer} />);
    fireEvent.change(screen.getByLabelText('Your working'), { target: { value: '2 + 2 = 5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check working' }));

    const result = screen.getByLabelText('Checker result');
    expect(result.parentElement).toHaveStyle({ opacity: '0' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit answer' }));

    expect(screen.getByLabelText('Your working')).toHaveValue('2 + 2 = 5');
    expect(screen.queryByLabelText('Checker result')).not.toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
