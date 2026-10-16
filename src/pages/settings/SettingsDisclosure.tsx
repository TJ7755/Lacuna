import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { ChevronDownIcon } from '../../components/ui/icons';
import { animatedDisclosureTiming } from '../../components/ui/AnimatedDisclosure';
import { motionTransition } from '../../components/ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { SettingsHeadingLevelProvider } from './SettingsSectionHeading';

function fragment() {
  try {
    return decodeURIComponent(window.location.hash.split('#').at(-1) ?? '');
  } catch {
    return '';
  }
}

/** Course-settings row treatment, retaining mounted forms and pending operations. */
export function SettingsDisclosure({
  id,
  title,
  summary,
  anchors,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  anchors: readonly string[];
  children: ReactNode;
}) {
  const matches = (target: string) => target === id || anchors.includes(target);
  const [open, setOpen] = useState(() => matches(fragment()));
  const panelId = useId();
  const headingId = useId();
  const pendingTarget = useRef<string | null>(matches(fragment()) ? fragment() : null);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);

  function scrollToTarget() {
    if (!pendingTarget.current) return;
    document.getElementById(pendingTarget.current)?.scrollIntoView({ block: 'start' });
    pendingTarget.current = null;
  }

  useEffect(() => {
    scrollToTarget();
  }, []);

  useEffect(() => {
    if (open && multiplier === 0) scrollToTarget();
  }, [open, multiplier]);

  useEffect(() => {
    function reveal() {
      const target = fragment();
      if (target !== id && !anchors.includes(target)) return;
      pendingTarget.current = target;
      if (open) scrollToTarget();
      else setOpen(true);
    }
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [id, anchors, open]);

  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-20">
      <h2 id={headingId}>
        <button
          type="button"
          data-press
          aria-expanded={open}
          aria-controls={panelId}
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
      <motion.div
        id={panelId}
        inert={!open}
        aria-hidden={!open || undefined}
        initial={false}
        animate={{
          overflow: 'hidden',
          height: open ? 'auto' : 0,
          opacity: open ? 1 : 0,
          transitionEnd: { overflow: open ? 'visible' : 'hidden' },
        }}
        transition={animatedDisclosureTiming(multiplier)}
        onAnimationComplete={open ? scrollToTarget : undefined}
        className="overflow-hidden"
      >
        <div className="px-2 pb-6 pt-2 [&_section[id]]:scroll-mt-20">
          <SettingsHeadingLevelProvider level={3}>{children}</SettingsHeadingLevelProvider>
        </div>
      </motion.div>
    </section>
  );
}
