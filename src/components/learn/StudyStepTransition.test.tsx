import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SessionSummary } from './types';
import { StudyStepTransition } from './StudyStepTransition';
import * as motionSettings from '../../state/motionSpeed';

afterEach(() => vi.restoreAllMocks());

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

function renderTransition(
  overrides: Partial<React.ComponentProps<typeof StudyStepTransition>> = {},
) {
  return render(
    <StudyStepTransition
      completedLabel="The blood"
      nextLabel="Practice"
      summary={summary(true)}
      canReviewDueCards
      breakPending={false}
      planningNextStep={false}
      {...callbacks()}
      {...overrides}
    />,
  );
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
        planningNextStep={false}
        {...actions}
      />,
    );

    expect(screen.getByLabelText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Step complete')).not.toBeInTheDocument();
    expect(screen.queryByText('Up next')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Checkpoint', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText('2 cards reviewed · 50% correct')).not.toBeInTheDocument();
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
        planningNextStep={false}
        {...actions}
      />,
    );

    expect(screen.getByText('Step paused')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Checkpoint' })).toBeInTheDocument();
    expect(screen.queryByText('Bonding')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(actions.onContinue).toHaveBeenCalledOnce();
  });

  it('keeps entering actions inert until their own animation ends', () => {
    vi.spyOn(motionSettings, 'speedMultiplier').mockReturnValue(1);
    const { container } = renderTransition();
    const actions = container.querySelector('.study-transition-actions')!;
    expect(actions).toHaveAttribute('inert');
    fireEvent.animationEnd(screen.getByRole('button', { name: 'Continue' }));
    expect(actions).toHaveAttribute('inert');
    fireEvent.animationEnd(actions);
    expect(actions).not.toHaveAttribute('inert');
  });

  it('makes actions available immediately when motion is disabled', () => {
    vi.spyOn(motionSettings, 'speedMultiplier').mockReturnValue(0);
    const onContinue = vi.fn();
    const { container } = renderTransition({ onContinue });
    expect(container.querySelector('.study-transition')).toHaveAttribute('data-motion', 'off');
    expect(container.querySelector('.study-transition-actions')).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('does not announce an empty course while planning the next step', () => {
    renderTransition({ nextLabel: undefined, planningNextStep: true });
    expect(screen.getByRole('button', { name: 'Planning next step…' })).toBeDisabled();
    expect(screen.queryByText('Nothing else is ready right now')).not.toBeInTheDocument();
  });

  it('offers finishing without a continuation when nothing else is ready', () => {
    renderTransition({ nextLabel: undefined, canReviewDueCards: false });
    expect(
      screen.getByRole('heading', { name: 'Nothing else is ready right now' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish for now' })).toBeInTheDocument();
  });

  it('shows factual revision counts and the next window without a readiness promise', () => {
    const revisionSummary: SessionSummary = {
      ...summary(true),
      revision: {
        cardsCovered: 7,
        cardsImproved: 5,
        cardsParked: 1,
        workNotReached: 3,
        nextWindowDay: '2026-07-18',
        replanExplanation: 'the assessment deadline moved',
      },
    };
    render(
      <StudyStepTransition
        completedLabel="Paper 1"
        summary={revisionSummary}
        canReviewDueCards={false}
        breakPending={false}
        planningNextStep={false}
        {...callbacks()}
      />,
    );

    expect(screen.getByText('Next revision window: Sat 18 Jul')).toBeInTheDocument();
    expect(screen.getByText('Plan updated: the assessment deadline moved.')).toBeInTheDocument();
    expect(screen.getByText('Not reached')).toBeInTheDocument();
    expect(screen.queryByText(/predicted|readiness|mark/i)).not.toBeInTheDocument();
  });

  it('shows readiness only when the model supplies prediction uncertainty', () => {
    render(
      <StudyStepTransition
        completedLabel="Paper 1"
        summary={{
          ...summary(true),
          revision: {
            cardsCovered: 7,
            cardsImproved: 5,
            cardsParked: 1,
            workNotReached: 3,
            predictedReadiness: 0.74,
            readinessUncertainty: 0.08,
          },
        }}
        canReviewDueCards={false}
        breakPending={false}
        planningNextStep={false}
        {...callbacks()}
      />,
    );

    expect(screen.getByText('74% predicted readiness · ±8% uncertainty')).toBeInTheDocument();
  });
});
