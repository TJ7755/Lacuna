import { useState, type ReactNode } from 'react';
import { m as motion } from 'motion/react';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { cn } from '../ui/cn';
import { MiniRing } from '../ui/MiniRing';

/** A hover/focus-expandable headline figure shown in a ChartCard's header —
 *  the compact value squircle-morphs to reveal one level more detail, following
 *  the same pattern as LessonNode's detail squircle. */
export interface ChartHeadline {
  /** The compact figure, e.g. "82%". */
  value: string;
  /** Progress fraction (0..1) for the accompanying MiniRing; omit for non-percentage figures. */
  ring?: number;
  /** Revealed on hover/focus — what the figure means and any breakdown. */
  detail: ReactNode;
}

function HeadlineStat({ headline }: { headline: ChartHeadline }) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [hovered, setHovered] = useState(false);
  const expanded = hovered;

  return (
    // Fixed slot anchored top-right so the pill can morph into a larger
    // squircle in place — like LessonNode's detail expansion — without
    // reflowing the header or neighbouring content.
    <div className="relative h-9 w-16 shrink-0">
      <motion.button
        type="button"
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        animate={{
          width: expanded ? 216 : 64,
          height: expanded ? 96 : 36,
          borderRadius: expanded ? 18 : 999,
        }}
        transition={m === 0 ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 * m }}
        className={cn(
          'absolute right-0 top-0 flex items-center justify-center gap-1.5 overflow-hidden border border-line-strong bg-surface-raised px-2.5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
          expanded ? 'z-10 items-start justify-start p-3 text-left shadow-lg shadow-black/10' : 'border-line-strong',
        )}
      >
        {expanded ? (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 * m, delay: 0.06 * m }}
            className="flex w-full min-w-0 flex-col gap-1"
          >
            <span className="flex items-center gap-1.5">
              {headline.ring !== undefined && <MiniRing value={headline.ring} size={14} strokeWidth={2} />}
              <span className="text-sm font-semibold tabular text-ink">{headline.value}</span>
            </span>
            <span className="text-xs leading-snug text-ink-soft">{headline.detail}</span>
          </motion.span>
        ) : (
          <>
            {headline.ring !== undefined && <MiniRing value={headline.ring} size={14} strokeWidth={2} />}
            <span className="text-sm font-semibold tabular text-ink">{headline.value}</span>
          </>
        )}
      </motion.button>
    </div>
  );
}

/** A titled container giving every chart a consistent frame and empty state. */
export function ChartCard({
  title,
  description,
  empty,
  emptyMessage,
  headline,
  children,
  delay = 0,
  className,
}: {
  title: string;
  description?: string;
  empty?: boolean;
  emptyMessage?: string;
  /** Optional headline figure shown in the header — hover/focus expands into detail. */
  headline?: ChartHeadline;
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const d = delay ?? 0;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl tracking-tight">{title}</h3>
          {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
        </div>
        {headline && !empty && <HeadlineStat headline={headline} />}
      </header>
      {empty ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24 * m, delay: (d + 0.1) * m }}
          className={cn('grid h-64 min-h-[14rem] place-items-center text-sm text-ink-faint', className)}
        >
          {emptyMessage ?? 'Not enough data yet.'}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.32 * m, delay: (d + 0.05) * m, ease: 'easeOut' }}
          // Use min-h instead of h so charts that need more vertical space
          // (e.g. with rotated x-axis labels) can grow without overflow,
          // and add min-w-0 so the chart doesn't push the grid track wider
          // than its share.
          className={cn('h-64 min-w-0', className)}
        >
          {children}
        </motion.div>
      )}
    </section>
  );
}
