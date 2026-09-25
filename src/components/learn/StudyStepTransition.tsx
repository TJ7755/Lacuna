import { useState, type CSSProperties } from 'react';
import { Button } from '../ui/Button';
import { CheckIcon, ClockIcon } from '../ui/icons';
import { PomodoroTimer } from './PomodoroTimer';
import type { SessionSummary } from './types';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import './StudyStepTransition.css';

interface StudyStepTransitionProps {
  completedLabel: string;
  nextLabel?: string;
  summary: SessionSummary;
  canReviewDueCards: boolean;
  breakPending: boolean;
  planningNextStep: boolean;
  onContinue: () => void;
  onTakeBreak: () => void;
  onDeferBreak: () => void;
  onReviewDueCards: () => void;
  onFinish: () => void;
}

function formatPlanDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** A quiet hand-off between conductor steps; the detailed report remains an end-of-period view. */
export function StudyStepTransition({
  completedLabel,
  nextLabel,
  summary,
  canReviewDueCards,
  breakPending,
  planningNextStep,
  onContinue,
  onTakeBreak,
  onDeferBreak,
  onReviewDueCards,
  onFinish,
}: StudyStepTransitionProps) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const incomplete = !summary.reachedGoal;

  const [arrived, setArrived] = useState(false);
  const hasNext = !incomplete && Boolean(nextLabel) && !summary.revision?.nextWindowDay;
  const destination = summary.revision?.nextWindowDay
    ? `Next revision window: ${formatPlanDay(summary.revision.nextWindowDay)}`
    : incomplete
      ? 'Resume when ready'
      : planningNextStep
        ? undefined
        : (nextLabel ?? 'Nothing else is ready right now');

  return (
    <div
      className="study-transition"
      style={{ '--step-motion': m } as CSSProperties}
      data-motion={m === 0 ? 'off' : 'on'}
    >
      <main className="study-transition-main" aria-label="Study progress">
        <div className="study-transition-timer">
          <PomodoroTimer />
        </div>
        <div className={`study-transition-completed ${hasNext ? 'has-next' : ''}`}>
          <span
            className="study-transition-tick"
            role="img"
            aria-label={incomplete ? 'Paused' : 'Completed'}
          >
            {incomplete ? (
              <ClockIcon width={24} height={24} />
            ) : (
              <CheckIcon width={24} height={24} />
            )}
          </span>
          <div className="study-transition-title">
            {incomplete && <p className="mb-2 text-sm text-ink-soft">Step paused</p>}
            <h1>{completedLabel}</h1>
          </div>
        </div>
        <div className="study-transition-details">
          {summary.revision && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <RevisionFact label="Covered" value={summary.revision.cardsCovered} />
              <RevisionFact label="Improved" value={summary.revision.cardsImproved} />
              <RevisionFact label="Parked" value={summary.revision.cardsParked} />
              <RevisionFact label="Not reached" value={summary.revision.workNotReached} />
            </div>
          )}

          {summary.revision?.replanExplanation && (
            <p className="mt-4 text-sm text-ink-soft">
              Plan updated: {summary.revision.replanExplanation}.
            </p>
          )}

          {summary.revision?.predictedReadiness !== undefined &&
            summary.revision.readinessUncertainty !== undefined && (
              <p className="mt-4 text-sm text-ink-soft">
                {Math.round(summary.revision.predictedReadiness * 100)}% predicted readiness · ±
                {Math.round(summary.revision.readinessUncertainty * 100)}% uncertainty
              </p>
            )}
        </div>
        {destination && (
          <div className={`study-transition-destination ${hasNext ? 'has-next' : ''}`}>
            {hasNext && (
              <span className="study-transition-node" aria-hidden="true">
                <TransitionArrow />
              </span>
            )}
            <h2>{destination}</h2>
          </div>
        )}
        <div
          className="study-transition-actions"
          inert={m > 0 && !arrived}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setArrived(true);
          }}
        >
          {breakPending && (
            <Button variant="primary" size="lg" onClick={onTakeBreak}>
              Take a break
            </Button>
          )}
          {(incomplete || nextLabel || planningNextStep) && (
            <Button
              variant={breakPending ? 'secondary' : 'primary'}
              size="lg"
              onClick={onContinue}
              disabled={planningNextStep}
              className="study-transition-continue"
            >
              {planningNextStep
                ? 'Planning next step…'
                : breakPending
                  ? 'Continue without break'
                  : incomplete
                    ? 'Resume'
                    : 'Continue'}
              <span className="study-transition-arrow" aria-hidden="true">
                <TransitionArrow />
              </span>
            </Button>
          )}
          {breakPending && (
            <Button variant="ghost" size="lg" onClick={onDeferBreak}>
              Dismiss break
            </Button>
          )}
          {canReviewDueCards && (
            <Button variant="ghost" size="lg" onClick={onReviewDueCards}>
              Review due cards
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={onFinish}>
            Finish for now
          </Button>
        </div>
      </main>
    </div>
  );
}

function RevisionFact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="font-display text-2xl tabular">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-ink-faint">{label}</p>
    </div>
  );
}

function TransitionArrow() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true">
      <path
        d="M1 8h19M14 2l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
