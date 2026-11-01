import type { QuestionSetProgress } from '../../questions/questionSetProgress';
import { cn } from '../ui/cn';

/**
 * A set's latest score with its recent history as bars, oldest on the left, so a learner
 * sees at a glance whether practice is paying off. Before any finished attempt it says so.
 */
export function QuestionSetScore({ progress }: { progress: QuestionSetProgress }) {
  if (progress.latest === undefined) {
    return <span className="text-sm text-ink-faint">No score yet</span>;
  }
  const label =
    progress.history.length > 1
      ? `Latest score ${progress.latest}%. Recent scores: ${progress.history.join('%, ')}%`
      : `Latest score ${progress.latest}%`;
  return (
    <div className="flex items-center gap-3" role="img" aria-label={label}>
      {progress.history.length > 1 && (
        <span aria-hidden="true" className="flex h-7 items-end gap-[3px]">
          {progress.history.map((score, index) => (
            <span
              key={index}
              className={cn(
                'w-1.5 rounded-sm',
                index === progress.history.length - 1 ? 'bg-accent' : 'bg-accent/40',
              )}
              // A 3px floor keeps a zero visible as a bar rather than a gap.
              style={{ height: `max(3px, ${score}%)` }}
            />
          ))}
        </span>
      )}
      <span aria-hidden="true" className="font-display text-2xl font-semibold tabular-nums">
        {progress.latest}%
      </span>
    </div>
  );
}
