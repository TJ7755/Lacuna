import { useMemo, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { bucketReviewsByDay, reviewTimestamps, addDays } from '../../fsrs/heatmap';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { formatDate, startOfDay } from '../../utils/datetime';
import { motionTransition } from '../ui/motion';
import type { Card } from '../../db/types';

/** How many weeks of history the calendar shows. */
const WEEKS = 26;
const CELL_PX = 12;
const GAP_PX = 3;
const WEEK_STRIDE = CELL_PX + GAP_PX;
const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

interface Cell {
  day: number;
  count: number;
  future: boolean;
}

/**
 * A contribution-style review calendar (reviews per local day), theme-aware via the
 * accent colour. Built entirely from existing review logs; nothing is persisted.
 */
export function ReviewHeatmap({ cards }: { cards: Card[] }) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const { columns, total, max, monthLabels } = useMemo(() => {
    const buckets = bucketReviewsByDay(reviewTimestamps(cards));
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
  }, [cards]);

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
  const gridRef = useRef<HTMLDivElement>(null);

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

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 * m, ease: [0.25, 0.1, 0.25, 1] }}
      className="rounded-2xl border border-line bg-surface p-5"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg">Review activity</h2>
        <span className="text-sm text-ink-faint">
          {total} review{total === 1 ? '' : 's'} in the last {WEEKS} weeks
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="flex flex-col gap-[3px] text-[10px] text-ink-faint sticky left-0 bg-surface z-10 pr-1 pt-[16px]">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i} className="h-[12px] inline-flex items-center">
              {label}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-[3px] relative">
          {/* Month labels: absolutely positioned above the grid so they can be
              wider than a single cell without overlapping adjacent columns. */}
          <div className="absolute top-0 left-0 h-[14px] pointer-events-none">
            {monthLabels.map((label) => (
              <span
                key={label.weekIndex}
                className="absolute text-[10px] text-ink-faint leading-[14px] whitespace-nowrap"
                style={{ left: `${label.weekIndex * WEEK_STRIDE}px` }}
              >
                {label.text}
              </span>
            ))}
          </div>
          <div ref={gridRef} role="grid" aria-label="Review activity by day" className="flex gap-[3px] pt-[16px]">
            {columns.map((col, w) => (
              <motion.div
                key={w}
                role="presentation"
                initial={{ opacity: 0, scaleY: 0.8 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{
                  duration: 0.16 * m,
                  delay: Math.min(w * 0.015, 0.3) * m,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
                className="flex flex-col gap-[3px] origin-top"
              >
                {col.map((cell) => (
                  cell.future ? (
                    <span
                      key={cell.day}
                      role="gridcell"
                      aria-hidden="true"
                      className="h-[12px] w-[12px] rounded-[2px] shrink-0"
                      style={cellStyle(cell)}
                    />
                  ) : (
                    (() => {
                      const label = `${cell.count} review${cell.count === 1 ? '' : 's'} on ${formatDate(cell.day)}`;
                      const active =
                        activeDay === cell.day ||
                        (activeDay === null && navigableCells[0]?.cell.day === cell.day);
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
                          whileHover={m > 0 ? { scale: 1.18 } : undefined}
                          whileFocus={m > 0 ? { scale: 1.18 } : undefined}
                          whileTap={m > 0 ? { scale: 0.9 } : undefined}
                          transition={motionTransition('feedback', m)}
                          className="block h-[12px] w-[12px] rounded-[2px] outline-none transition-[box-shadow,transform] focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transition-none"
                          style={cellStyle(cell)}
                        />
                      );
                    })()
                  )
                ))}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      {tooltip && typeof document !== 'undefined'
        ? createPortal(
            <span
              role="tooltip"
              aria-hidden="true"
              className="pointer-events-none fixed z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-paper shadow-lg"
              style={{
                position: 'fixed',
                top: tooltip.rect.bottom + 8,
                left: Math.min(
                  Math.max(tooltip.rect.left + tooltip.rect.width / 2, 8),
                  (typeof window !== 'undefined' ? window.innerWidth : 16) - 8,
                ),
              }}
            >
              {tooltip.label}
            </span>,
            document.body,
          )
        : null}
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-ink-faint">
        <span>Less</span>
        {[0, 0.25, 0.45, 0.65, 1].map((alpha, i) => (
          <span
            key={i}
            className="h-[10px] w-[10px] rounded-[2px]"
            style={{
              background: alpha === 0 ? 'hsl(var(--line) / 0.7)' : `hsl(var(--accent) / ${alpha})`,
            }}
          />
        ))}
        <span>More</span>
      </div>
    </motion.section>
  );
}
