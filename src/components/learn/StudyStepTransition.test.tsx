import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { SessionSummary } from './types';
import type { StudyProgress } from '../../course/studyProgress';
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

const progress: StudyProgress = {
  fsrs: {
    newCards: 2,
    learningCards: 1,
    reviewCards: 5,
    dueCards: 3,
    totalCards: 8,
    meanStability: 4.2,
    recallNow: 0.88,
  },
  priorities: [
    {
      conceptId: 'cells',
      name: 'Cells and transport',
      dueCards: 3,
      newCards: 2,
      questionCount: 4,
      knowledgeGap: false,
      applicationGap: false,
      skills: [
        {
          id: 'causal-link',
          name: 'Link cause and effect',
          demonstratedCount: 2,
          gapCount: 1,
          latestOutcome: 'gap',
        },
        {
          id: 'paired-comparison',
          name: 'Compare like with like',
          demonstratedCount: 0,
          gapCount: 0,
        },
      ],
    },
  ],
};

describe('StudyStepTransition', () => {
  it('shows the named exam countdown and forecast beside the ranked topics', () => {
    renderTransition({
      nextConceptId: 'cells',
      progress: {
        ...progress,
        exam: {
          name: 'Biology paper 1',
          date: Date.UTC(2026, 10, 3, 0, 30),
          timeZone: 'America/Los_Angeles',
          daysRemaining: 7,
          value: 0.64,
          label: 'Predicted recall',
          securedCards: 2,
          totalCards: 8,
        },
      },
    });
    const panel = screen.getByRole('region', { name: 'Progress and priorities' });
    expect(within(panel).getByRole('heading', { name: 'Biology paper 1' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('2 Nov');
    expect(panel).toHaveTextContent('7days to go');
    expect(
      within(panel).getByRole('progressbar', { name: 'Predicted recall on exam day' }),
    ).toHaveAttribute('aria-valuenow', '64');
    expect(within(panel).getByText('Cells and transport')).toHaveClass('font-semibold');
    expect(within(panel).getByText('3 due')).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/cards at 90%|exam skill|Not yet assessed/);
  });

  it('shows current recall and due cards when no exam is upcoming', () => {
    renderTransition({ progress });
    const panel = screen.getByRole('region', { name: 'Progress and priorities' });
    expect(within(panel).getByRole('progressbar', { name: 'Recall now' })).toHaveAttribute(
      'aria-valuenow',
      '88',
    );
    expect(panel).toHaveTextContent('3cards due');
    expect(within(panel).getByText('Cells and transport')).not.toHaveClass('font-semibold');
    expect(panel).not.toHaveTextContent(/days to go/);
  });

  it('retains actual question marks without inventing card reviews or recall for a cardless exam', () => {
    renderTransition({
      summary: {
        kind: 'question',
        marking: 'Self-marked',
        score: {
          status: 'complete',
          total: { awarded: 1, available: 2 },
          resolvedCount: 1,
          unsureCount: 0,
          unmarkedCount: 0,
          dimensions: {
            knowledge: { awarded: 0, available: 0 },
            application: { awarded: 1, available: 2 },
            'exam-execution': { awarded: 0, available: 0 },
            mixed: { awarded: 0, available: 0 },
          },
        },
      },
      progress: {
        ...progress,
        exam: {
          name: 'Biology paper 1',
          date: Date.UTC(2026, 10, 3),
          daysRemaining: 7,
          value: null,
          label: 'Predicted recall',
          securedCards: 0,
          totalCards: 0,
        },
      },
    });
    expect(screen.getByRole('img', { name: '1 of 2 marks' })).toBeInTheDocument();
    expect(screen.queryByText(/Self-marked|recall data|recalled/)).not.toBeInTheDocument();
    // Without card memory there is no forecast to draw, only the countdown.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Progress and priorities' })).toHaveTextContent(
      '7days to go',
    );
  });

  it('claims focus from the inert outgoing step during the crossfade', () => {
    const outgoing = document.createElement('div');
    const oldAction = document.createElement('button');
    outgoing.append(oldAction);
    document.body.append(outgoing);
    oldAction.focus();
    outgoing.inert = true;
    renderTransition();
    expect(screen.getByRole('button', { name: /^Continue/ })).toHaveFocus();
    outgoing.remove();
  });
  it('hands the keyboard to the primary action once the next step is planned', () => {
    const { rerender } = renderTransition({ planningNextStep: true });
    expect(document.body).toHaveFocus();
    rerender(
      <StudyStepTransition
        completedLabel="The blood"
        nextLabel="Practice"
        summary={summary(true)}
        canReviewDueCards
        breakPending={false}
        planningNextStep={false}
        {...callbacks()}
      />,
    );
    expect(screen.getByRole('button', { name: /^Continue/ })).toHaveFocus();
  });

  it('offers the break first when one is due', () => {
    renderTransition({ breakPending: true });
    expect(screen.getByRole('button', { name: 'Take a break' })).toHaveFocus();
  });

  it('keeps focus on a control the learner already chose', () => {
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();
    renderTransition();
    expect(other).toHaveFocus();
    other.remove();
  });

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
    expect(screen.getByRole('heading', { name: 'Checkpoint', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Atomic structure')).toBeInTheDocument();
    // The answers are drawn, not written out.
    expect(screen.getByRole('img', { name: '1 of 2 recalled' })).toBeInTheDocument();
    expect(screen.queryByText(/recalled/)).not.toBeInTheDocument();
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

  it('makes actions available before the entrance finishes', () => {
    vi.spyOn(motionSettings, 'speedMultiplier').mockReturnValue(1);
    const onContinue = vi.fn();
    const { container } = renderTransition({ onContinue });
    expect(container.querySelector('.study-transition-actions')).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledOnce();
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
    // Each figure sits in the tinted well, not an outlined box.
    const fact = screen.getByText('Not reached').parentElement;
    expect(fact).toHaveClass('bg-ink/[0.04]');
    expect(fact).not.toHaveClass('border');
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
