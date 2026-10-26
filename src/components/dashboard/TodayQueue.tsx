import { scaledSpring } from '../ui/motion';
import { m as motion } from 'motion/react';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CardsIcon, CheckIcon, ClockIcon, MoreIcon } from '../ui/icons';
import { Button } from '../ui/Button';
import { MOTION_DURATION, MOTION_EASING } from '../ui/motion';
import { prefetchRoute } from '../../routes/prefetch';
import type { ForecastStatus } from './forecastStatus';
import { useCourseColours } from '../../state/ShellCourseData';
import { contextMenuHandlers } from '../ui/contextMenu';
import type { CourseSummary } from '../../state/courseSummaries';
import './TodayQueue.css';

/**
 * What a row can offer today: work to study, today's work finished, nothing due
 * without anything studied today, no cards at all, or a summary still loading.
 */
export type QueueState = 'study' | 'done' | 'clear' | 'empty' | 'loading';

export function queueState(
  summary:
    | Pick<
        CourseSummary,
        | 'cardCount'
        | 'eligible'
        | 'reviewedTodayCount'
        | 'examPracticeEligible'
        | 'unreviewed'
        | 'completedLessonCount'
        | 'lessonCount'
      >
    | undefined,
): QueueState {
  if (!summary) return 'loading';
  if (summary.eligible > 0) return 'study';
  if (summary.examPracticeEligible) return 'study';
  if (summary.unreviewed && summary.completedLessonCount < summary.lessonCount) return 'study';
  if (summary.cardCount === 0) return 'empty';
  return summary.reviewedTodayCount > 0 ? 'done' : 'clear';
}

/** The row whose Study button leads, which the S shortcut must also open. */
export function leadStudyRow<T extends Pick<QueueRow, 'state'>>(rows: readonly T[]): T | undefined {
  return rows.find((row) => row.state === 'study');
}

export interface QueueRow {
  id: string;
  name: string;
  status: ForecastStatus;
  state: QueueState;
  due: number;
  learning?: string;
  minutes: number;
  href: string;
  hasPendingUpdate: boolean;
}

/** Rows past this many arrive together, so a long queue never trickles in for long. */
const STAGGER_ROWS = 5;
const STAGGER_STEP = 0.05;

/**
 * Today's courses, most urgent first, each with its workload and a way straight in. Rows
 * fade in top to bottom on a short, bounded stagger, starting `delay` seconds in.
 */
export function TodayQueue({
  rows,
  delay = 0,
  multiplier,
  onStudy,
  onMenu,
  openMenuId,
}: {
  rows: QueueRow[];
  delay?: number;
  multiplier: number;
  onStudy: (id: string) => void;
  onMenu: (id: string, position: { x: number; y: number }, trigger: HTMLButtonElement) => void;
  openMenuId?: string;
}) {
  const colours = useCourseColours();
  const navigate = useNavigate();
  const menuButtons = useRef(new Map<string, HTMLButtonElement>());
  const openActions = (rowId: string) => {
    const trigger = menuButtons.current.get(rowId);
    if (!trigger) return null;
    return () => {
      const box = trigger.getBoundingClientRect();
      onMenu(rowId, { x: box.right - 160, y: box.bottom + 6 }, trigger);
    };
  };
  const lead = leadStudyRow(rows);
  return (
    <section aria-label="Today, most urgent first" className="flex flex-col gap-2">
      {rows.map((row, index) => {
        const arrival = delay + Math.min(index, STAGGER_ROWS) * STAGGER_STEP;
        return (
          <motion.div
            key={row.id}
            {...contextMenuHandlers(() => openActions(row.id))}
            layout={multiplier > 0 ? 'position' : false}
            initial={false}
            animate={{
              opacity: 1,
              // A transition on the target replaces the prop below, so the fade names its own.
              transition: {
                opacity: {
                  duration: MOTION_DURATION.local * multiplier,
                  delay: arrival * multiplier,
                  ease: MOTION_EASING.emphasised,
                },
              },
            }}
            transition={{
              duration: MOTION_DURATION.local * multiplier,
              ease: MOTION_EASING.emphasised,
            }}
            className="today-course-row group flex items-center gap-3 rounded-[18px] bg-surface py-3 pl-4 pr-2 sm:gap-4 sm:pl-5 sm:pr-3 card-surface card-surface-control transition-colors hover:bg-surface-raised"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: colours.get(row.id) }}
            />
            <button
              type="button"
              onClick={() => navigate(row.href)}
              onPointerEnter={() => prefetchRoute(row.href)}
              onFocus={() => prefetchRoute(row.href)}
              className="flex min-h-11 min-w-0 flex-1 items-center text-left font-display text-lg font-semibold leading-tight sm:text-xl tracking-tight text-ink hover:underline hover:decoration-2 hover:underline-offset-4"
            >
              <span className="line-clamp-2 break-words">
                {row.name}
                {row.hasPendingUpdate && (
                  <span className="ml-2 align-middle text-xs max-sm:hidden font-bold text-accent-ink">
                    Update available
                  </span>
                )}
              </span>
            </button>
            {row.state === 'done' ? (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-positive">
                <motion.span
                  className="grid h-6 w-6 place-items-center rounded-full bg-positive text-paper"
                  initial={multiplier > 0 ? { scale: 0, rotate: -90 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    ...scaledSpring(multiplier, 500, 15),
                    delay: (arrival + 0.2) * multiplier,
                  }}
                >
                  <CheckIcon width={14} height={14} />
                </motion.span>
                <span className="max-sm:sr-only">Done for today</span>
              </span>
            ) : row.state === 'clear' || row.state === 'empty' ? (
              <span className="text-sm text-ink-faint">
                {row.state === 'empty' ? 'No cards yet' : 'No reviews due'}
              </span>
            ) : row.state === 'study' ? (
              <>
                {row.due > 0 ? (
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
                  </>
                ) : (
                  <span className="text-sm text-ink-faint max-sm:sr-only">
                    {row.learning ?? 'Practice available'}
                  </span>
                )}
                {/* Study opens the course's session plan, as Study does on the course page. */}
                <Button
                  data-study-trigger={row.id}
                  variant={row === lead ? 'primary' : 'secondary'}
                  onClick={() => onStudy(row.id)}
                  aria-label={`Study ${row.name}`}
                >
                  Study
                  <ArrowRightIcon />
                </Button>
              </>
            ) : null}
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
