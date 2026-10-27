import { useRef, type CSSProperties } from 'react';
import { Button } from '../ui/Button';
import { CheckIcon, ClockIcon } from '../ui/icons';
import { STUDY_HEADER_ROW } from './studyHeaderLayout';
import { PomodoroTimer } from './PomodoroTimer';
import type { StudyStepSummary } from '../../course/sessionSummary';
import type { StudyProgress } from '../../course/studyProgress';
import { StudyProgressPanel } from './StudyProgressPanel';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { useUnclaimedFocus } from '../../hooks/useUnclaimedFocus';
import './StudyStepTransition.css';

interface StudyStepTransitionProps {
  completedLabel: string;
  nextLabel?: string;
  summary: StudyStepSummary;
  progress?: StudyProgress;
  nextReason?: string;
  canReviewDueCards: boolean;
  canReviewEarlierMaterial?: boolean;
  onReviewEarlierMaterial?: () => void;
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

/** The hand-off names the next step and makes its supporting progress evidence visible. */
export function StudyStepTransition({
  completedLabel,
  nextLabel,
  summary,
  progress,
  nextReason,
  canReviewDueCards,
  canReviewEarlierMaterial,
  onReviewEarlierMaterial,
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
  const cardSummary = 'events' in summary ? summary : undefined;
  const questionSummary = 'kind' in summary ? summary : undefined;
  const incomplete = cardSummary ? !cardSummary.reachedGoal && !cardSummary.blockComplete : false;
  // The finished step's controls are gone; hand the keyboard to the primary action.
  const actionsRef = useRef<HTMLDivElement>(null);
  useUnclaimedFocus(actionsRef, !planningNextStep);

  const hasNext = !incomplete && Boolean(nextLabel) && !cardSummary?.revision?.nextWindowDay;
  const destination = cardSummary?.revision?.nextWindowDay
    ? `Next revision window: ${formatPlanDay(cardSummary?.revision.nextWindowDay)}`
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
      <header className="pt-[env(safe-area-inset-top)]">
        <div className={`${STUDY_HEADER_ROW} justify-end`}>
          <div className="hidden shrink-0 min-[340px]:block">
            <PomodoroTimer />
          </div>
        </div>
      </header>
      <main className="study-transition-main" aria-label="Study progress">
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
          {cardSummary && cardSummary.events.length > 0 && (
            <p className="text-sm text-ink-soft">
              {cardSummary.events.length} reviews ·{' '}
              {cardSummary.events.filter((event) => event.correct).length} recalled
            </p>
          )}
          {questionSummary && (
            <p className="text-sm text-ink-soft">
              {questionSummary.score.total.awarded} / {questionSummary.score.total.available} marks
              · {questionSummary.marking}
              {questionSummary.score.status === 'provisional' ? ' · provisional' : ''}
            </p>
          )}
          {cardSummary?.revision && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <RevisionFact label="Covered" value={cardSummary?.revision.cardsCovered} />
              <RevisionFact label="Improved" value={cardSummary?.revision.cardsImproved} />
              <RevisionFact label="Parked" value={cardSummary?.revision.cardsParked} />
              <RevisionFact label="Not reached" value={cardSummary?.revision.workNotReached} />
            </div>
          )}

          {cardSummary?.revision?.replanExplanation && (
            <p className="mt-4 text-sm text-ink-soft">
              Plan updated: {cardSummary?.revision.replanExplanation}.
            </p>
          )}

          {cardSummary?.revision?.predictedReadiness !== undefined &&
            cardSummary?.revision.readinessUncertainty !== undefined && (
              <p className="mt-4 text-sm text-ink-soft">
                {Math.round(cardSummary?.revision.predictedReadiness * 100)}% predicted readiness ·
                ±{Math.round(cardSummary?.revision.readinessUncertainty * 100)}% uncertainty
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
        {nextReason && !incomplete && (
          <p className="study-transition-reason text-sm text-ink-soft">{nextReason}</p>
        )}
        {progress && <StudyProgressPanel progress={progress} />}
        <div ref={actionsRef} className="study-transition-actions">
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
          {canReviewEarlierMaterial && (
            <Button variant="ghost" size="lg" onClick={onReviewEarlierMaterial}>
              Review earlier material
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
    <div className="rounded-2xl bg-ink/[0.04] px-4 py-3">
      <p className="font-display text-2xl tabular">{value}</p>
      <p className="mt-1 text-sm text-ink-faint">{label}</p>
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
