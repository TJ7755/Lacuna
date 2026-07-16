// The hint ladder for lines-mode sequence cards (see next_plan.md §1.5): two optional,
// ungraded steps between the question and full reveal —
//   step 1: first letters of each word (firstLetterHint.ts)
//   step 2: first word of each clause/sentence-chunk (firstWordsHint.ts)
// Extracted from LearnMode.tsx/FlipCard so the reveal-flow component stays focused on
// flip/swipe mechanics rather than hint presentation.

import { motion } from 'motion/react';
import { firstLetterHint } from '../../utils/firstLetterHint';
import { firstWordsHint } from '../../utils/firstWordsHint';
import { Button } from '../ui/Button';

/** Shown in the question phase for a lines-mode card while a further hint step remains.
 *  `step` is the ladder step already revealed (0 = none yet, 1 = letters shown); the
 *  label reflects the step the button will reveal next. */
export function LineHintButton({ step, onReveal }: { step: 0 | 1; onReveal: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onReveal} className="mt-4">
      {step === 0 ? 'Hint' : 'More hint'}
    </Button>
  );
}

/** Shown once a hint step has been requested, for the currently-revealed step. */
export function LineHintDisplay({
  answer,
  step,
  m,
}: {
  answer: string;
  step: 1 | 2;
  m: number;
}) {
  const hint = step === 1 ? firstLetterHint(answer) : firstWordsHint(answer);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 * m, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto mt-4 max-w-prose text-center"
    >
      <div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-ink-faint">Hint</div>
      <div className="text-lg tracking-wide text-ink-faint">{hint}</div>
    </motion.div>
  );
}
