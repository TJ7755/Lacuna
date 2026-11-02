import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { AnimatedDisclosure } from '../../components/ui/AnimatedDisclosure';
import { ChevronDownIcon } from '../../components/ui/icons';
import { motionTransition } from '../../components/ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

const DEEP_LINK_SCROLL_DELAY_MS = 250;

/** Secondary course settings retain their place as the row opens and closes. */
export function CourseSettingsDisclosure({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  /** Open on arrival, for a deep link from elsewhere; the section is also scrolled to. */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!defaultOpen) return;
    // The route resets the scroll position and the sections above settle their height on
    // arrival; scroll once that has happened, unless the learner has already moved.
    const timer = window.setTimeout(
      () => section.current?.scrollIntoView({ block: 'start' }),
      DEEP_LINK_SCROLL_DELAY_MS,
    );
    const cancel = () => window.clearTimeout(timer);
    window.addEventListener('wheel', cancel, { once: true, passive: true });
    window.addEventListener('keydown', cancel, { once: true });
    return () => {
      cancel();
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('keydown', cancel);
    };
  }, [defaultOpen]);
  const id = useId();
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  return (
    <section ref={section} className="scroll-mt-24">
      <h2>
        <button
          type="button"
          // Colour acknowledges the press; pin scale for global keyboard feedback too.
          data-press
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full scale-100! items-center gap-4 rounded-2xl px-[25px] py-5 text-left md:px-[29px] transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06]"
        >
          <span className="min-w-0 flex-1 font-semibold text-ink">{title}</span>
          <span className="hidden max-w-[55%] text-right text-sm font-normal text-ink-faint sm:block">
            {summary}
          </span>
          {/* The chevron path has 4.5px of air each side; the margin puts its tip on the content edge. */}
          <motion.span
            aria-hidden="true"
            animate={{ rotate: open ? 180 : 0 }}
            transition={motionTransition('feedback', multiplier)}
            className="-mr-[4.5px] shrink-0 text-ink-faint"
          >
            <ChevronDownIcon width={18} height={18} />
          </motion.span>
        </button>
      </h2>
      <div id={id}>
        <AnimatedDisclosure open={open} innerClassName="px-[25px] pb-6 pt-2 md:px-[29px]">
          {children}
        </AnimatedDisclosure>
      </div>
    </section>
  );
}
