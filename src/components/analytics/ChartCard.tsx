import { SectionCard } from '../ui/SectionCard';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { m as motion } from 'motion/react';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { cn } from '../ui/cn';
import { StudyDrawing } from '../ui/StudyDrawing';
import { useRevealOnce } from './useRevealOnce';

const RevealContext = createContext(true);

/**
 * Responsive chart container that mounts only once its card has scrolled into view, so
 * the chart's drawing animation plays as it arrives rather than off-screen.
 */
export function ChartFrame({ children }: { children: ReactNode }) {
  const revealed = useContext(RevealContext);
  if (!revealed) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  );
}

/** One entry in a card's direct legend: the series, its colour and, ideally, its value. */
export interface LegendItem {
  label: string;
  colour: string;
  value?: string;
  dashed?: boolean;
}

/** A titled container giving every chart a consistent frame and empty state. */
export function ChartCard({
  title,
  data,
  description,
  legend,
  empty,
  emptyMessage,
  emptyDrawing = 'recall',
  children,
  className,
  compactEmpty = false,
}: {
  title: string;
  data?: { columns: string[]; rows: (string | number)[][] };
  description?: string;
  /** Direct legend with values, shown beside the title instead of repeating them. */
  legend?: LegendItem[];
  empty?: boolean;
  emptyMessage?: string;
  emptyDrawing?: ComponentProps<typeof StudyDrawing>['kind'];
  children: ReactNode;
  /** Retained for callers that stagger cards; the reveal now follows scrolling. */
  delay?: number;
  className?: string;
  /** Use for explanatory empty states that do not need to reserve chart height. */
  compactEmpty?: boolean;
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [ref, revealed] = useRevealOnce<HTMLDivElement>(m === 0);
  return (
    <SectionCard className="min-w-0 rounded-3xl bg-surface p-5 shadow-card md:p-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
        </div>
        {legend && legend.length > 0 && !empty && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft" aria-label="Legend">
            {legend.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn('h-2.5 w-2.5 rounded-full', item.dashed && 'opacity-60')}
                  style={{ background: item.colour }}
                />
                {item.label}
                {item.value !== undefined && (
                  <strong className="font-bold tabular-nums text-ink">{item.value}</strong>
                )}
              </li>
            ))}
          </ul>
        )}
      </header>
      {empty ? (
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-5 text-center text-sm text-ink-faint',
            compactEmpty ? 'min-h-24 py-6' : 'h-64 min-h-[14rem]',
            className,
          )}
        >
          <StudyDrawing
            kind={emptyDrawing}
            className={compactEmpty ? 'h-16 w-16 opacity-70' : 'h-24 w-24 opacity-70'}
          />
          <p>{emptyMessage ?? 'Not enough data yet.'}</p>
        </div>
      ) : (
        <motion.div
          ref={ref}
          initial={false}
          animate={{ opacity: revealed ? 1 : 0 }}
          transition={{ duration: 0.3 * m }}
          // Charts that need more room (long category labels) can grow past the
          // default height, and min-w-0 stops one from widening its grid track.
          className={cn('h-64 min-w-0', className)}
        >
          <RevealContext.Provider value={revealed}>{children}</RevealContext.Provider>
        </motion.div>
      )}
      {!empty && data && data.rows.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="-ml-3 inline-flex min-h-11 w-fit cursor-pointer items-center rounded-full px-3 text-ink-soft hover:bg-ink/[0.05] focus-visible:outline-2 focus-visible:outline-accent">
            View data
          </summary>
          <div
            className="mt-2 max-h-80 overflow-auto"
            tabIndex={0}
            role="region"
            aria-label={`${title} data`}
          >
            <table className="w-full text-left tabular-nums">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  {data.columns.map((column) => (
                    <th key={column} scope="col" className="px-3 py-2 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={index} className="border-t border-line">
                    {row.map((value, cell) => (
                      <td key={cell} className="px-3 py-2 text-ink-soft">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </SectionCard>
  );
}
