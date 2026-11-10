import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from '../ui/cn';
import { StudyExitButton } from '../learn/StudyExitButton';
import { MOTION_EASING } from '../ui/motion';

/** Exit plus one progress segment per Question; completed segments are filled. */
export function QuestionSessionHeader({
  completed,
  total,
  onExit,
}: {
  completed: number;
  total: number;
  onExit: (anchor: HTMLDivElement) => void;
}) {
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const current = Math.min(completed + 1, total);
  return (
    <header className="flex items-center gap-5 py-5">
      <StudyExitButton onExit={onExit} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm tabular-nums text-ink-soft">
          <span className="font-bold text-ink">{current}</span> of {total}
        </p>
        <div
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={completed}
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              className={cn(
                'relative h-1.5 overflow-hidden rounded-[3px]',
                index === completed ? 'bg-accent/35' : 'bg-ink/10',
              )}
            >
              <motion.span
                initial={false}
                animate={{ scaleX: index < completed ? 1 : 0 }}
                transition={{ duration: 0.4 * multiplier, ease: MOTION_EASING.emphasised }}
                className="absolute inset-0 origin-left rounded-[3px] bg-positive"
              />
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
