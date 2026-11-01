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

/** Beyond this many answers a segment per answer stops reading as a sequence. */
const MAX_RESULT_SEGMENTS = 24;

interface StudyStepTransitionProps {
  completedLabel: string;
  nextLabel?: string;
  summary: StudyStepSummary;
  progress?: StudyProgress;
  nextReason?: string;
  /** The topic the next step practises, highlighted among the priorities. */
  nextConceptId?: string;
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

/**
 * The hand-off names the next step beside the course evidence behind it. The step column is
 * pinned in place so it never moves when the evidence panel changes shape.
 */
export function StudyStepTransition({
  completedLabel,
  nextLabel,
  summary,
  progress,
  nextReason,
  nextConceptId,
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

  const nextWindowDay = cardSummary?.revision?.nextWindowDay;
  const heading = incomplete
    ? completedLabel
    : nextWindowDay
      ? `Next revision window: ${formatPlanDay(nextWindowDay)}`
      : planningNextStep
        ? undefined
        : (nextLabel ?? 'Nothing else is ready right now');

  const results = cardSummary
    ? cardSummary.events.map((event) => event.correct)
    : questionSummary
      ? Array.from(
          { length: questionSummary.score.total.available },
          (_, index) => index < questionSummary.score.total.awarded,
        )
      : [];
  const resultLabel = cardSummary
    ? `${results.filter(Boolean).length} of ${results.length} recalled`
    : `${questionSummary?.score.total.awarded} of ${results.length} marks`;

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
        <div className="min-w-0">
          <p className="study-transition-done">
            <span role="img" aria-label={incomplete ? 'Paused' : 'Completed'}>
              {incomplete ? (
                <ClockIcon width={18} height={18} />
              ) : (
                <CheckIcon width={18} height={18} />
              )}
            </span>
            <span className="truncate">{incomplete ? 'Step paused' : completedLabel}</span>
          </p>
          <ResultStrip results={results} label={resultLabel} />

          <h1 className="study-transition-heading">
            {heading ?? <span aria-hidden="true">&nbsp;</span>}
          </h1>
          {nextReason && !incomplete && !planningNextStep && (
            <p className="study-transition-reason">{nextReason}</p>
          )}

          {cardSummary?.revision && (
            <div className="study-transition-revision mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <RevisionFact label="Covered" value={cardSummary.revision.cardsCovered} />
              <RevisionFact label="Improved" value={cardSummary.revision.cardsImproved} />
              <RevisionFact label="Parked" value={cardSummary.revision.cardsParked} />
              <RevisionFact label="Not reached" value={cardSummary.revision.workNotReached} />
            </div>
          )}
          {cardSummary?.revision?.replanExplanation && (
            <p className="mt-4 text-base text-ink-soft">
              Plan updated: {cardSummary.revision.replanExplanation}.
            </p>
          )}
          {cardSummary?.revision?.predictedReadiness !== undefined &&
            cardSummary.revision.readinessUncertainty !== undefined && (
              <p className="mt-4 text-base text-ink-soft">
                {Math.round(cardSummary.revision.predictedReadiness * 100)}% predicted readiness · ±
                {Math.round(cardSummary.revision.readinessUncertainty * 100)}% uncertainty
              </p>
            )}

          <div ref={actionsRef} className="study-transition-actions">
            <div className="flex flex-wrap items-center gap-2">
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
            </div>
            <div className="study-transition-secondary">
              {breakPending && (
                <Button variant="ghost" size="md" onClick={onDeferBreak}>
                  Dismiss break
                </Button>
              )}
              {canReviewEarlierMaterial && (
                <Button variant="ghost" size="md" onClick={onReviewEarlierMaterial}>
                  Review earlier material
                </Button>
              )}
              {canReviewDueCards && (
                <Button variant="ghost" size="md" onClick={onReviewDueCards}>
                  Review due cards
                </Button>
              )}
              <Button variant="ghost" size="md" onClick={onFinish}>
                Finish for now
              </Button>
            </div>
          </div>
        </div>
        {progress && (
          <StudyProgressPanel progress={progress} nextConceptId={nextConceptId} motion={m} />
        )}
      </main>
    </div>
  );
}

/** One segment per answer, in answer order; a single proportion once that would crowd. */
function ResultStrip({ results, label }: { results: boolean[]; label: string }) {
  if (results.length === 0) return <div className="study-transition-strip" />;
  const hits = results.filter(Boolean).length;
  const bars =
    results.length > MAX_RESULT_SEGMENTS
      ? [
          { hit: true, grow: hits },
          { hit: false, grow: results.length - hits },
        ].filter((bar) => bar.grow > 0)
      : results.map((hit) => ({ hit, grow: 1 }));
  return (
    <div className="study-transition-strip" role="img" aria-label={label}>
      {bars.map((bar, index) => (
        <span
          key={index}
          className={bar.hit ? 'bg-positive' : 'bg-line-strong'}
          style={{ flexGrow: bar.grow, '--segment-index': index } as CSSProperties}
        />
      ))}
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
