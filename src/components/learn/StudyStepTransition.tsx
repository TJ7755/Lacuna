import { m as motion } from 'motion/react';
import { Button } from '../ui/Button';
import { CheckIcon, ClockIcon, PlayIcon } from '../ui/icons';
import { PomodoroTimer } from './PomodoroTimer';
import type { SessionSummary } from './types';

interface StudyStepTransitionProps {
  completedLabel: string;
  nextLabel?: string;
  summary: SessionSummary;
  canReviewDueCards: boolean;
  breakPending: boolean;
  onContinue: () => void;
  onTakeBreak: () => void;
  onDeferBreak: () => void;
  onReviewDueCards: () => void;
  onFinish: () => void;
}

/** A quiet hand-off between conductor steps; the detailed report remains an end-of-period view. */
export function StudyStepTransition({
  completedLabel,
  nextLabel,
  summary,
  canReviewDueCards,
  breakPending,
  onContinue,
  onTakeBreak,
  onDeferBreak,
  onReviewDueCards,
  onFinish,
}: StudyStepTransitionProps) {
  const reviewed = summary.events.length;
  const correct = summary.events.filter((event) => event.correct).length;
  const accuracy = reviewed > 0 ? Math.round((correct / reviewed) * 100) : null;
  const incomplete = !summary.reachedGoal;

  return (
    <div className="min-h-screen bg-paper px-6 py-10">
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center"
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-positive/12 text-positive">
            {incomplete ? (
              <ClockIcon width={24} height={24} />
            ) : (
              <CheckIcon width={24} height={24} />
            )}
          </span>
          <PomodoroTimer />
        </div>

        <p className="mb-2 text-sm uppercase tracking-[0.18em] text-ink-faint">
          {incomplete ? 'Step paused' : 'Step complete'}
        </p>
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">{completedLabel}</h1>

        {(reviewed > 0 || accuracy !== null) && (
          <p className="mt-4 text-sm text-ink-soft">
            {reviewed} card{reviewed === 1 ? '' : 's'} reviewed
            {accuracy === null ? '' : ` · ${accuracy}% correct`}
          </p>
        )}

        <div className="mt-10 border-t border-line pt-7">
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-ink-faint">
            {incomplete ? 'Resume when ready' : nextLabel ? 'Up next' : 'Course status'}
          </p>
          <p className="font-display text-2xl">
            {incomplete ? completedLabel : (nextLabel ?? 'Nothing else is ready right now')}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            {breakPending && (
              <Button variant="primary" size="lg" onClick={onTakeBreak}>
                Take a break
              </Button>
            )}
            {(incomplete || nextLabel) && (
              <Button
                variant={breakPending ? 'secondary' : 'primary'}
                size="lg"
                onClick={onContinue}
              >
                <PlayIcon width={18} height={18} />
                {breakPending ? 'Continue without break' : incomplete ? 'Resume' : 'Continue'}
              </Button>
            )}
            {breakPending && (
              <Button variant="ghost" size="lg" onClick={onDeferBreak}>
                Dismiss break
              </Button>
            )}
            {canReviewDueCards && (
              <Button variant="secondary" size="lg" onClick={onReviewDueCards}>
                Review due cards
              </Button>
            )}
            <Button variant="ghost" size="lg" onClick={onFinish}>
              Finish for now
            </Button>
          </div>
        </div>
      </motion.main>
    </div>
  );
}
