import { useId } from 'react';
import { m as motion } from 'motion/react';
import { AppLink as Link } from '../../components/ui/AppLink';
import { AnimatedDisclosure } from '../../components/ui/AnimatedDisclosure';
import { ChevronDownIcon } from '../../components/ui/icons';
import { motionTransition } from '../../components/ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import type { HelpTopic } from './helpTopics';
import { CardTypeExamples, HelpShortcuts, TouchExample } from './HelpExamples';

export const HELP_LINK_CLASS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface-raised px-3 text-sm font-semibold text-ink transition-colors hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink';

export function HelpTopicRow({
  topic,
  open,
  onToggle,
  onRevealed,
}: {
  topic: HelpTopic;
  open: boolean;
  onToggle: () => void;
  onRevealed: () => void;
}) {
  const panelId = useId();
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  return (
    <section id={topic.id} className="scroll-mt-20 border-b border-line last:border-b-0">
      <h3>
        <button
          type="button"
          data-press
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-11 w-full items-center gap-4 rounded-xl px-2 py-4 text-left text-sm font-medium text-ink transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06]"
        >
          <span className="min-w-0 flex-1">{topic.question}</span>
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open ? 180 : 0 }}
            transition={motionTransition('feedback', multiplier)}
            className="shrink-0 text-ink-faint"
          >
            <ChevronDownIcon width={18} height={18} />
          </motion.span>
        </button>
      </h3>
      <div id={panelId}>
        <AnimatedDisclosure open={open} onAnimationComplete={open ? onRevealed : undefined}>
          <div className="select-text px-2 pb-5 text-sm leading-relaxed text-ink-soft">
            <p className="max-w-prose">{topic.answer}</p>
            {topic.id === 'keyboard-shortcuts' && <HelpShortcuts />}
            {topic.id === 'touch-gestures' && <TouchExample />}
            {topic.id === 'card-types' && <CardTypeExamples />}
            {topic.action && (
              <Link to={topic.action.to} className={`${HELP_LINK_CLASS} mt-3`}>
                {topic.action.label}
              </Link>
            )}
          </div>
        </AnimatedDisclosure>
      </div>
    </section>
  );
}
