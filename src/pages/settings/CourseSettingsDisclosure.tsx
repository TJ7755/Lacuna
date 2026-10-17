import { useId, useState, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { AnimatedDisclosure } from '../../components/ui/AnimatedDisclosure';
import { ChevronDownIcon } from '../../components/ui/icons';
import { motionTransition } from '../../components/ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

/** Secondary course settings retain their place as the row opens and closes. */
export function CourseSettingsDisclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  return (
    <section>
      <h2>
        <button
          type="button"
          // Colour acknowledges the press; pin scale for global keyboard feedback too.
          data-press
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full scale-100! items-center gap-4 rounded-2xl px-2 py-5 text-left transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06]"
        >
          <span className="min-w-0 flex-1 font-semibold text-ink">{title}</span>
          <span className="hidden max-w-[55%] text-right text-sm font-normal text-ink-faint sm:block">
            {summary}
          </span>
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open ? 180 : 0 }}
            transition={motionTransition('feedback', multiplier)}
            className="shrink-0 text-ink-faint"
          >
            <ChevronDownIcon width={18} height={18} />
          </motion.span>
        </button>
      </h2>
      <div id={id}>
        <AnimatedDisclosure open={open} innerClassName="pb-6 pl-5 pr-2 pt-2 sm:pl-6">
          {children}
        </AnimatedDisclosure>
      </div>
    </section>
  );
}
