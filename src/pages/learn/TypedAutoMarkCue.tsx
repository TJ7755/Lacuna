import { AnimatePresence, m as motion } from 'motion/react';
import { CheckIcon, CloseIcon } from '../../components/ui/icons';
import { cn } from '../../components/ui/cn';
import { scaledSpring } from '../../components/ui/motion';
import type { TypedAutoMark } from './useTypedAutoMark';

/** A quiet note of what automatic marking decided; the grade controls stay usable to change it. */
export function TypedAutoMarkCue({ mark, m }: { mark: TypedAutoMark; m: number }) {
  const key =
    mark.state === 'marked'
      ? `marked-${mark.correct}`
      : mark.state === 'checking'
        ? 'checking'
        : null;
  // Automatic marking off: the study screen stays exactly as it was.
  if (mark.state === 'off') return null;
  return (
    <div role="status" aria-live="polite" className="flex min-h-8 shrink-0 justify-center">
      <AnimatePresence mode="wait" initial={false}>
        {key && (
          <motion.p
            key={key}
            initial={m > 0 ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={m > 0 ? { opacity: 0, y: -4 } : undefined}
            transition={scaledSpring(m, 420, 34)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm',
              mark.state === 'marked'
                ? mark.correct
                  ? 'bg-accent-soft font-semibold text-accent-ink'
                  : 'bg-negative/10 font-semibold text-negative'
                : 'text-ink-faint',
            )}
          >
            {mark.state === 'checking' && 'Checking your answer…'}
            {mark.state === 'marked' && (
              <>
                {mark.correct ? (
                  <CheckIcon width={16} height={16} aria-hidden="true" />
                ) : (
                  <CloseIcon width={16} height={16} aria-hidden="true" />
                )}
                {mark.correct ? 'Correct' : 'Not quite'}
                {mark.provenance && (
                  <span className="font-normal opacity-80">· marked automatically</span>
                )}
              </>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
