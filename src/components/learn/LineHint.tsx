// The first-letter hint step for lines-mode sequence cards (see next_plan.md §1.5):
// an optional, ungraded mid-point between the question and full reveal, showing the
// initial letter of each word of the answer. Extracted from LearnMode.tsx/FlipCard so the
// reveal-flow component stays focused on flip/swipe mechanics rather than hint presentation.

import { motion } from 'motion/react';
import { firstLetterHint } from '../../utils/firstLetterHint';
import { Button } from '../ui/Button';

/** Shown in the question phase for a lines-mode card that hasn't asked for a hint yet. */
export function LineHintButton({ onReveal }: { onReveal: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onReveal} className="mt-4">
      Hint
    </Button>
  );
}

/** Shown once the hint has been requested, in place of the button. */
export function LineHintDisplay({ answer, m }: { answer: string; m: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 * m, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto mt-4 max-w-prose text-center"
    >
      <div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-ink-faint">Hint</div>
      <div className="text-lg tracking-wide text-ink-faint">{firstLetterHint(answer)}</div>
    </motion.div>
  );
}
