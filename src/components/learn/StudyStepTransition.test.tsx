import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SessionSummary } from './types';
import { StudyStepTransition } from './StudyStepTransition';

vi.mock('./PomodoroTimer', () => ({
  PomodoroTimer: () => <div data-testid="pomodoro" />,
}));

function summary(reachedGoal: boolean): SessionSummary {
  return {
    events: [
      { grade: 3, correct: true, responseTimeSec: 2, distracted: false },
      { grade: 1, correct: false, responseTimeSec: 4, distracted: false },
    ],
    masteryBefore: 0.2,
    masteryAfter: 0.5,
    objectiveLabel: 'Readiness',
    focusFraction: 1,
    reachedGoal,
    limitReached: false,
  };
}

function callbacks() {
  return {
    onContinue: vi.fn(),
    onTakeBreak: vi.fn(),
    onDeferBreak: vi.fn(),
    onReviewDueCards: vi.fn(),
    onFinish: vi.fn(),
  };
}

describe('StudyStepTransition', () => {
  it('presents the freshly planned next step and delegates every available action', () => {
    const actions = callbacks();
    render(
      <StudyStepTransition
        completedLabel="Atomic structure"
        nextLabel="Checkpoint"
        summary={summary(true)}
        canReviewDueCards
        breakPending
        {...actions}
      />,
    );

    expect(screen.getByText('Step complete')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint')).toBeInTheDocument();
    expect(screen.getByText('2 cards reviewed · 50% correct')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take a break' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue without break' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss break' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review due cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish for now' }));

    expect(actions.onTakeBreak).toHaveBeenCalledOnce();
    expect(actions.onContinue).toHaveBeenCalledOnce();
    expect(actions.onDeferBreak).toHaveBeenCalledOnce();
    expect(actions.onReviewDueCards).toHaveBeenCalledOnce();
    expect(actions.onFinish).toHaveBeenCalledOnce();
  });

  it('offers Resume for an incomplete step and does not claim a different next step', () => {
    const actions = callbacks();
    render(
      <StudyStepTransition
        completedLabel="Checkpoint"
        nextLabel="Bonding"
        summary={summary(false)}
        canReviewDueCards={false}
        breakPending={false}
        {...actions}
      />,
    );

    expect(screen.getByText('Step paused')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Checkpoint' })).toBeInTheDocument();
    expect(screen.queryByText('Bonding')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(actions.onContinue).toHaveBeenCalledOnce();
  });
});
