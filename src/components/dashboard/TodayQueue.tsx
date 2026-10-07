import { m as motion } from 'motion/react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, CardsIcon, CheckIcon, ClockIcon, MoreIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { MOTION_EASING } from '../ui/motion';
import { prefetchRoute } from '../../routes/prefetch';
import { STATUS_COLOUR, type ForecastStatus } from './ForecastChart';
import { contextMenuHandlers } from '../ui/contextMenu';

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
  openMenuId,
}: {
  rows: QueueRow[];
  multiplier: number;
  onStudy: (id: string) => void;
  onMenu: (id: string, position: { x: number; y: number }, trigger: HTMLButtonElement) => void;
  openMenuId?: string;
}) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const menuButtons = useRef(new Map<string, HTMLButtonElement>());
  const openActions = (rowId: string) => {
    const trigger = menuButtons.current.get(rowId);
    if (!trigger) return null;
    return () => {
      const box = trigger.getBoundingClientRect();
      onMenu(rowId, { x: box.right - 160, y: box.bottom + 6 }, trigger);
    };
  };
  const liftTransition = { duration: 0.16 * multiplier, delay: 0, ease: MOTION_EASING.emphasised };
  const firstDue = rows.findIndex((row) => row.due > 0);
  return (
    <section aria-label="Today, most urgent first" className="flex flex-col gap-2">
      {rows.map((row, index) => {
        const done = row.due === 0;
        const lead = index === firstDue;
        return (
          <motion.div
            key={row.id}
            {...contextMenuHandlers(() => openActions(row.id))}
            layout={multiplier > 0 ? 'position' : false}
            initial={multiplier > 0 ? { opacity: 0 } : false}
            animate={{
              opacity: 1,
              y: multiplier > 0 && focusedId === row.id ? -2 : 0,
              transition: { y: liftTransition },
            }}
            transition={{
              duration: 0.46 * multiplier,
              delay: (0.05 + index * 0.06) * multiplier,
              ease: MOTION_EASING.emphasised,
            }}
            whileHover={multiplier > 0 ? { y: -2, transition: liftTransition } : undefined}
            onFocusCapture={() => setFocusedId(row.id)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                setFocusedId(null);
            }}
            className="group flex items-center gap-3 rounded-[18px] bg-surface py-3 pl-4 pr-2 sm:gap-4 sm:pl-5 sm:pr-3 shadow-[0_1px_2px_hsl(var(--ink)/0.05)] transition-shadow hover:shadow-[0_12px_28px_-18px_hsl(var(--ink)/0.35)] focus-within:shadow-[0_12px_28px_-18px_hsl(var(--ink)/0.35)]"
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
              className="flex min-h-11 min-w-0 flex-1 items-center font-display text-lg font-semibold leading-tight sm:text-xl tracking-tight text-ink hover:underline hover:decoration-2 hover:underline-offset-4"
            >
              <span className="line-clamp-2 break-words">
                {row.name}
                {row.hasPendingUpdate && (
                  <span className="ml-2 align-middle text-xs max-sm:hidden font-bold text-accent-ink">
                    Update available
                  </span>
                )}
              </span>
            </Link>
            {done ? (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-positive">
                <motion.span
                  className="grid h-6 w-6 place-items-center rounded-full bg-positive text-surface"
                  initial={multiplier > 0 ? { scale: 0, rotate: -90 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 15,
                    delay: (0.3 + index * 0.06) * multiplier,
                  }}
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
                <span className="hidden min-w-[72px] items-center gap-1.5 whitespace-nowrap text-ink-soft tabular-nums sm:inline-flex">
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
                  <ArrowRightIcon className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              </>
            )}
            <button
              ref={(button) => {
                if (button) menuButtons.current.set(row.id, button);
                else menuButtons.current.delete(row.id);
              }}
              type="button"
              aria-label={`More for ${row.name}`}
              aria-haspopup="menu"
              aria-expanded={openMenuId === row.id}
              aria-controls={openMenuId === row.id ? 'dashboard-course-actions' : undefined}
              data-course-menu-trigger={row.id}
              onClick={() => openActions(row.id)?.()}
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
