import { m as motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { CardsIcon, CheckIcon, ClockIcon, MoreIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { MOTION_EASING } from '../ui/motion';
import { prefetchRoute } from '../../routes/prefetch';
import { STATUS_COLOUR, type ForecastStatus } from './ForecastChart';

export interface QueueRow {
  id: string;
  name: string;
  status: ForecastStatus;
  due: number;
  minutes: number;
  href: string;
  hasPendingUpdate: boolean;
}

/** Today's courses, most urgent first, each with its workload and a way straight in. */
export function TodayQueue({
  rows,
  multiplier,
  onStudy,
  onMenu,
}: {
  rows: QueueRow[];
  multiplier: number;
  onStudy: (id: string) => void;
  onMenu: (id: string, position: { x: number; y: number }, trigger: HTMLButtonElement) => void;
}) {
  const firstDue = rows.findIndex((row) => row.due > 0);
  return (
    <section aria-label="Today, most urgent first" className="flex flex-col gap-2">
      {rows.map((row, index) => {
        const done = row.due === 0;
        const lead = index === firstDue;
        return (
          <motion.div
            key={row.id}
            layout={multiplier > 0 ? 'position' : false}
            initial={multiplier > 0 ? { opacity: 0, y: 14 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.46 * multiplier,
              delay: (0.25 + index * 0.06) * multiplier,
              ease: MOTION_EASING.emphasised,
            }}
            whileHover={multiplier > 0 ? { y: -2 } : undefined}
            className="group flex items-center gap-3 rounded-[18px] bg-surface py-3 pl-4 pr-2 sm:gap-4 sm:pl-5 sm:pr-3 shadow-[0_1px_2px_hsl(var(--ink)/0.05)] transition-shadow hover:shadow-[0_12px_28px_-18px_hsl(var(--ink)/0.35)]"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: STATUS_COLOUR[row.status] }}
            />
            <Link
              to={row.href}
              onPointerEnter={() => prefetchRoute(row.href)}
              onFocus={() => prefetchRoute(row.href)}
              className="min-w-0 flex-1 truncate font-display text-lg font-semibold sm:text-xl tracking-tight text-ink hover:underline hover:decoration-2 hover:underline-offset-4"
            >
              {row.name}
              {row.hasPendingUpdate && (
                <span className="ml-2 align-middle text-xs max-sm:hidden font-bold text-accent-ink">Update ready</span>
              )}
            </Link>
            {done ? (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-positive">
                <motion.span
                  className="grid h-6 w-6 place-items-center rounded-full bg-positive text-surface"
                  initial={multiplier > 0 ? { scale: 0, rotate: -90 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15, delay: (0.5 + index * 0.06) * multiplier }}
                >
                  <CheckIcon width={14} height={14} />
                </motion.span>
                <span className="max-sm:sr-only">Done for today</span>
              </span>
            ) : (
              <>
                <span className="hidden items-center gap-1.5 text-ink-soft tabular-nums sm:inline-flex">
                  <CardsIcon width={16} height={16} aria-hidden="true" />
                  <span className="sr-only">Cards due:</span>
                  {row.due}
                </span>
                <span className="hidden w-[72px] items-center gap-1.5 text-ink-soft tabular-nums sm:inline-flex">
                  <ClockIcon width={16} height={16} aria-hidden="true" />
                  {Math.max(1, Math.round(row.minutes))} min
                </span>
                <button
                  type="button"
                  onClick={() => onStudy(row.id)}
                  aria-label={`Start ${row.name}`}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-full border-[1.5px] px-4 font-bold sm:px-5 transition-colors',
                    lead
                      ? 'border-accent bg-accent text-accent-fg hover:brightness-105'
                      : 'border-ink text-ink hover:bg-ink hover:text-paper',
                  )}
                >
                  Start
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </>
            )}
            <button
              type="button"
              aria-label={`More for ${row.name}`}
              aria-haspopup="menu"
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                onMenu(row.id, { x: box.right - 160, y: box.bottom + 6 }, event.currentTarget);
              }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <MoreIcon width={18} height={18} />
            </button>
          </motion.div>
        );
      })}
    </section>
  );
}
