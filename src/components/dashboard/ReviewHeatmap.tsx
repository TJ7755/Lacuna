import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRevealOnce } from '../analytics/useRevealOnce';
import { m as motion } from 'motion/react';
import { createPortal } from 'react-dom';
import {
  bucketReviewsByDay,
  reviewTimestamps,
  addDays,
  type ReviewActivity,
} from '../../fsrs/heatmap';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { formatDate, startOfDay } from '../../utils/datetime';
import { MOTION_EASING } from '../ui/motion';
import type { Card } from '../../db/types';

/** How many weeks of history the calendar shows. */
const WEEKS = 26;
/** Weekday names shown beside the grid, by Monday-indexed row. */
const WEEKDAY_LABELS: Record<number, string> = { 0: 'Mon', 3: 'Thu', 6: 'Sun' };
/** Longest the diagonal fade-in may take to sweep across the grid, in seconds. */
const WAVE_SECONDS = 0.6;

interface Cell {
  day: number;
  count: number;
  future: boolean;
}

export function clampTooltipLeft(cellRect: Pick<DOMRect, 'left' | 'width'>, tooltipWidth: number, viewportWidth: number) {
  const preferred = cellRect.left + cellRect.width / 2 - tooltipWidth / 2;
  return Math.min(Math.max(preferred, 8), Math.max(8, viewportWidth - tooltipWidth - 8));
}

/**
 * A contribution-style review calendar (reviews per local day), theme-aware via the
 * accent colour. Built entirely from existing review logs; nothing is persisted.
 */
export function ReviewHeatmap({ cards, activity }: { cards: Card[]; activity?: ReviewActivity }) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const [sectionRef, revealed] = useRevealOnce<HTMLElement>(m === 0);
  const { columns, total, max, monthLabels } = useMemo(() => {
    const buckets = bucketReviewsByDay(reviewTimestamps(cards, activity));
    const today = startOfDay(Date.now());
    // Monday-indexed weekday so weeks read left-to-right, Monday at the top.
    const weekday = (new Date(today).getDay() + 6) % 7;
    // DST-safe: use date arithmetic instead of raw ms subtraction.
    const gridEnd = (() => {
      const d = new Date(today);
      d.setDate(d.getDate() + (6 - weekday));
      return startOfDay(d.getTime());
    })();
    const gridStart = (() => {
      const d = new Date(gridEnd);
      d.setDate(d.getDate() - (WEEKS * 7 - 1));
      return startOfDay(d.getTime());
    })();

    const cols: Cell[][] = [];
    let maxCount = 0;
    let sum = 0;
    for (let w = 0; w < WEEKS; w += 1) {
      const col: Cell[] = [];
      for (let d = 0; d < 7; d += 1) {
        const day = addDays(gridStart, w * 7 + d);
        const count = buckets.get(day) ?? 0;
        maxCount = Math.max(maxCount, count);
        sum += count;
        col.push({ day, count, future: day > today });
      }
      cols.push(col);
    }

    // Build month labels with de-duplication so adjacent names never overlap.
    const labels: { weekIndex: number; text: string }[] = [];
    let lastLabelWeek = -Infinity;
    for (let w = 0; w < cols.length; w += 1) {
      const firstDay = new Date(cols[w][0].day);
      const prev = w > 0 ? new Date(cols[w - 1][0].day) : null;
      const isNewMonth = !prev || firstDay.getMonth() !== prev.getMonth();
      if (isNewMonth && w - lastLabelWeek >= 3) {
        labels.push({
          weekIndex: w,
          text: firstDay.toLocaleDateString('en-GB', { month: 'short' }),
        });
        lastLabelWeek = w;
      }
    }

    return { columns: cols, total: sum, max: maxCount, monthLabels: labels };
  }, [cards, activity]);

  const navigableCells = useMemo(
    () =>
      columns
        .flatMap((column, weekIndex) =>
          column.map((cell, dayIndex) => ({ cell, weekIndex, dayIndex })),
        )
        .filter(({ cell }) => !cell.future),
    [columns],
  );
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ label: string; rect: DOMRect } | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) {
      setTooltipLeft(null);
      return;
    }
    setTooltipLeft(
      clampTooltipLeft(
        tooltip.rect,
        tooltipRef.current.getBoundingClientRect().width,
        typeof window === 'undefined' ? 0 : window.innerWidth,
      ),
    );
  }, [tooltip]);

  // Five intensity bands, GitHub-style, expressed as accent opacity so they track
  // the chosen accent colour and the light/dark theme automatically.
  function cellStyle(cell: Cell): React.CSSProperties {
    if (cell.future) return { visibility: 'hidden' };
    if (cell.count === 0) return { background: 'hsl(var(--line) / 0.7)' };
    const band = max <= 1 ? 1 : Math.ceil((cell.count / max) * 4);
    const alpha = [0.25, 0.45, 0.65, 0.85, 1][Math.min(band, 4)];
    return { background: `hsl(var(--accent) / ${alpha})` };
  }

  function showTooltip(cell: Cell, target: HTMLElement) {
    const label = `${cell.count} review${cell.count === 1 ? '' : 's'} on ${formatDate(cell.day)}`;
    setTooltip({ label, rect: target.getBoundingClientRect() });
  }

  function moveCell(key: string) {
    const firstDay = navigableCells[0]?.cell.day;
    const current = navigableCells.find(({ cell }) => cell.day === (activeDay ?? firstDay));
    if (!current) return;
    const horizontal = key === 'ArrowRight' || key === 'ArrowLeft';
    const delta = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : key === 'ArrowDown' ? 1 : -1;
    const target = navigableCells.find(
      ({ weekIndex, dayIndex }) =>
        weekIndex === current.weekIndex + (horizontal ? delta : 0) &&
        dayIndex === current.dayIndex + (horizontal ? 0 : delta),
    );
    if (!target) return;
    setActiveDay(target.cell.day);
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-review-heatmap-cell="${target.cell.day}"]`)
      ?.focus();
  }

  const cellCount = WEEKS * 7;
  return (
    <section
      ref={sectionRef}
      aria-label="Review activity"
      className="rounded-3xl bg-surface p-5 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)] md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">When you studied</h2>
        <span className="text-sm text-ink-soft tabular-nums">
          {total} review{total === 1 ? '' : 's'} in {WEEKS} weeks
        </span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div
          ref={gridRef}
          role="grid"
          aria-label="Review activity by day"
          className="grid min-w-[480px] gap-[4px]"
          style={{
            gridTemplateColumns: `28px repeat(${WEEKS}, minmax(0, 1fr))`,
          }}
        >
          {monthLabels.map((label) => (
            <span
              key={label.weekIndex}
              aria-hidden="true"
              className="whitespace-nowrap pb-1 text-xs leading-none text-ink-faint"
              style={{ gridColumn: label.weekIndex + 2, gridRow: 1 }}
            >
              {label.text}
            </span>
          ))}
          {Object.entries(WEEKDAY_LABELS).map(([row, text]) => (
            <span
              key={row}
              aria-hidden="true"
              className="flex items-center text-xs text-ink-faint"
              style={{ gridColumn: 1, gridRow: Number(row) + 2 }}
            >
              {text}
            </span>
          ))}
          {columns.flatMap((col, w) =>
            col.map((cell, d) => {
              const placement = { gridColumn: w + 2, gridRow: d + 2 };
              if (cell.future) {
                return (
                  <span
                    key={cell.day}
                    role="gridcell"
                    aria-hidden="true"
                    className="aspect-square rounded-[4px]"
                    style={{ ...placement, ...cellStyle(cell) }}
                  />
                );
              }
              const label = `${cell.count} review${cell.count === 1 ? '' : 's'} on ${formatDate(cell.day)}`;
              const active =
                activeDay === cell.day ||
                (activeDay === null && navigableCells[0]?.cell.day === cell.day);
              // A diagonal wave: the delay grows with distance from the top-left corner.
              const delay = Math.min(((w + d) / cellCount) * WAVE_SECONDS * 4, WAVE_SECONDS) * m;
              return (
                <motion.div
                  key={cell.day}
                  role="gridcell"
                  aria-label={label}
                  data-review-heatmap-cell={cell.day}
                  tabIndex={active ? 0 : -1}
                  onFocus={(event) => {
                    setActiveDay(cell.day);
                    showTooltip(cell, event.currentTarget);
                  }}
                  onBlur={() => setTooltip(null)}
                  onMouseEnter={(event) => showTooltip(cell, event.currentTarget)}
                  onMouseLeave={(event) => {
                    if (document.activeElement !== event.currentTarget) setTooltip(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key.startsWith('Arrow')) {
                      event.preventDefault();
                      moveCell(event.key);
                    }
                  }}
                  initial={m > 0 ? { opacity: 0, scale: 0.5 } : false}
                  animate={revealed ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
                  whileHover={m > 0 ? { scale: 1.18 } : undefined}
                  whileFocus={m > 0 ? { scale: 1.18 } : undefined}
                  data-press=""
                  whileTap={m > 0 ? { scale: 0.9 } : undefined}
                  transition={{
                    duration: 0.3 * m,
                    delay,
                    ease: MOTION_EASING.emphasised,
                  }}
                  className="aspect-square rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  style={{ ...placement, ...cellStyle(cell) }}
                />
              );
            }),
          )}
        </div>
      </div>
      {tooltip && typeof document !== 'undefined'
        ? createPortal(
            <span
              ref={tooltipRef}
              role="tooltip"
              aria-hidden="true"
              className="pointer-events-none fixed z-50 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-paper shadow-lg"
              style={{
                position: 'fixed',
                top: tooltip.rect.bottom + 8,
                left: tooltipLeft ?? 0,
                visibility: tooltipLeft === null ? 'hidden' : 'visible',
              }}
            >
              {tooltip.label}
            </span>,
            document.body,
          )
        : null}
      <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-ink-faint">
        <span>Less</span>
        {[0, 0.25, 0.45, 0.65, 1].map((alpha, i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-[3px]"
            style={{
              background: alpha === 0 ? 'hsl(var(--line) / 0.7)' : `hsl(var(--accent) / ${alpha})`,
            }}
          />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}
