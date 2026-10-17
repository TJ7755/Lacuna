import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { MOTION_EASING } from '../ui/motion';
import { formatDate, formatShortDate } from '../../utils/datetime';
import type { CourseForecast, ForecastPoint } from '../../fsrs/courseForecast';
import { STATUS_LABEL, type ForecastStatus } from './forecastStatus';

export interface ForecastLine {
  id: string;
  name: string;
  status: ForecastStatus;
  forecast: CourseForecast;
  /** The stop-now figure over the chart's past days, ending today at `forecast.ifStopped`. */
  history: ForecastPoint[];
}

/**
 * Lines are told apart by course, not status: four on-track courses would otherwise draw four
 * identical green lines. The first course takes the readable accent; the rest use the chart series.
 */
export function courseColour(index: number): string {
  return index === 0 ? 'hsl(var(--accent-ink))' : `hsl(var(--series-${((index - 1) % 5) + 1}))`;
}

const WIDE_WIDTH = 640;
const LEFT = 40;
const RIGHT = 16;
const TOP = 14;
const BOTTOM = 34;

/**
 * The chart is drawn at its rendered width so text keeps its real pixel size on a phone
 * instead of shrinking with the viewBox. Height follows the width, within sensible limits.
 * The first measurement lands before paint, so the chart never shows at a guessed size
 * and then resizes, shifting everything below it.
 */
function useChartSize() {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(WIDE_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = Math.round(el.getBoundingClientRect().width);
    if (first > 0) setWidth(first);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const height = Math.round(Math.max(190, Math.min(260, width * 0.5)));
  return { ref, W: width, H: height, narrow: width < 480 };
}

/**
 * Eases a stepped series into a calm curve for display: a short centred moving
 * average that keeps the first and last points exact. A rising series stays rising.
 */
export function easeSeries(values: number[], radius = 3): number[] {
  const n = values.length;
  return values.map((value, index) => {
    if (index === 0 || index === n - 1) return value;
    const reach = Math.min(radius, index, n - 1 - index);
    let sum = 0;
    for (let k = index - reach; k <= index + reach; k++) sum += values[k];
    return sum / (reach * 2 + 1);
  });
}

/** Five tidy ticks from 100% down, stepping by a round amount that reaches every value. */
export function recallTicks(values: number[]): number[] {
  const lowest = Math.min(0.9, ...values.filter(Number.isFinite));
  const step = [0.05, 0.1, 0.2, 0.25].find((candidate) => 1 - 4 * candidate <= lowest - 0.02) ?? 0.25;
  return [0, 1, 2, 3, 4].map((i) => Math.round((1 - step * i) * 100) / 100);
}

/**
 * A monotone cubic through the points (Fritsch and Carlson), so the curve never
 * swings above or below the values it joins.
 */
export function smoothPath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return '';
  const f = (value: number) => value.toFixed(1);
  if (n < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ');
  const slopes = points.slice(1).map((p, i) => (p.y - points[i].y) / (p.x - points[i].x || 1));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    const [a, b] = [slopes[i - 1], slopes[i]];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < n; i++) {
    const p = points[i - 1];
    const q = points[i];
    const h = (q.x - p.x) / 3;
    d += ` C${f(p.x + h)} ${f(p.y + tangents[i - 1] * h)}, ${f(q.x - h)} ${f(q.y - tangents[i] * h)}, ${f(q.x)} ${f(q.y)}`;
  }
  return d;
}

const DAY = 86_400_000;
/** Smallest vertical gap between today's percentage labels. */
const LABEL_GAP = 22;
/**
 * Beyond this many courses the chart spotlights the highest stop-now forecasts, descending,
 * and keeps the rest as quiet context: nine coloured lines and labels read as noise, and
 * the series palette starts repeating after six.
 */
const SPOTLIGHT_LIMIT = 4;
const SPOTLIGHT = 3;
const CONTEXT_COLOUR = 'hsl(var(--ink-faint))';

/**
 * Spreads label centres at least `gap` apart while keeping each as close to its point as it
 * can and all of them between `top` and `bottom`. Returns positions in the input order.
 */
export function spreadLabels(ys: number[], top: number, bottom: number, gap: number): number[] {
  const order = ys.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y);
  const placed = order.map((entry) => Math.min(bottom, Math.max(top, entry.y)));
  for (let i = 1; i < placed.length; i++) placed[i] = Math.max(placed[i], placed[i - 1] + gap);
  // Anything pushed past the floor shifts the stack back up from it.
  for (let i = placed.length - 1; i >= 0; i--) {
    const limit = i === placed.length - 1 ? bottom : placed[i + 1] - gap;
    placed[i] = Math.min(placed[i], limit);
  }
  const result = new Array<number>(ys.length);
  order.forEach((entry, i) => (result[entry.index] = placed[i]));
  return result;
}

/**
 * Exam-day forecast: how much of each course would be recalled on exam day if study
 * stopped now, traced over recent days up to today against the target. The window runs
 * `past` days back and `future` days ahead; nothing is projected after today, which only
 * holds the exam markers. Lines draw in, today's points land with a small spring, and
 * choosing a course in the legend brings its line forward. With many courses only the highest
 * stop-now forecasts are coloured and labelled; the rest stay faint until chosen.
 */
export function ForecastChart({
  lines: inputLines,
  now,
  past,
  future,
  multiplier,
}: {
  lines: ForecastLine[];
  now: number;
  past: number;
  future: number;
  multiplier: number;
}) {
  const titleId = useId();
  const { ref, W, H, narrow } = useChartSize();
  const [focus, setFocus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const spotlit = inputLines.length <= SPOTLIGHT_LIMIT ? inputLines.length : SPOTLIGHT;
  const lines = useMemo(() => {
    const ranked = [...inputLines]
      .sort((a, b) => b.forecast.ifStopped - a.forecast.ifStopped)
      .slice(0, spotlit);
    const ids = new Set(ranked.map((line) => line.id));
    return [...ranked, ...inputLines.filter((line) => !ids.has(line.id))];
  }, [inputLines, spotlit]);
  const hidden = lines.length - spotlit;
  const colour = (index: number) => (index < spotlit ? courseColour(index) : CONTEXT_COLOUR);
  const target = lines[0]?.forecast.target ?? 0.9;
  const sharedTarget = lines.every((line) => Math.abs(line.forecast.target - target) < 0.005);

  const geometry = useMemo(() => {
    const start = now - past * DAY;
    const stop = now + future * DAY;
    const ticks = recallTicks([
      target,
      ...lines.flatMap((line) => line.history.map((point) => point.recall)),
    ]);
    const top = ticks[0];
    const bottom = ticks[ticks.length - 1];
    const x = (at: number) => LEFT + ((at - start) / (stop - start)) * (W - LEFT - RIGHT);
    const y = (recall: number) =>
      TOP + ((top - Math.max(bottom, Math.min(top, recall))) / (top - bottom)) * (H - TOP - BOTTOM);

    // Date labels: the window's start and today, then each exam inside the window,
    // dropping any that would collide.
    const marks: { at: number; label: string; strong: boolean; anchor: 'start' | 'middle' | 'end' }[] = [
      { at: start, label: formatShortDate(start), strong: false, anchor: 'start' },
      { at: now, label: 'Today', strong: true, anchor: 'middle' },
    ];
    const exams = [
      ...new Set(lines.filter((line) => line.forecast.hasExam).map((line) => line.forecast.end)),
    ].sort((a, b) => a - b);
    const inside = exams.filter((at) => at <= stop);
    // A phone has room for the word alone: the date would collide with Today. The label
    // centres on its marker unless half of it would run past the chart's edge.
    const halfLabel = narrow ? 18 : 44;
    for (const at of inside) {
      const tooClose = marks.some((mark) => Math.abs(x(mark.at) - x(at)) < (narrow ? 44 : 72));
      if (!tooClose)
        marks.push({
          at,
          label: narrow ? 'Exam' : `${formatShortDate(at)} · Exam`,
          strong: true,
          anchor: x(at) + halfLabel > W ? 'end' : 'middle',
        });
    }
    const beyond = exams.find((at) => at > stop);

    return { x, y, ticks, marks, inside, beyond };
  }, [lines, now, past, future, target, W, H, narrow]);

  const { x, y, ticks, marks, inside, beyond } = geometry;
  const draw = multiplier > 0;
  const plotTop = y(ticks[0]);
  const plotBottom = y(ticks[ticks.length - 1]);

  // Only spotlit courses, and whichever course is chosen in the legend, carry today's
  // figure. The figures sit beside their points, nudged apart where courses agree and
  // kept off the axis.
  const labelled = lines.filter((line, index) => index < spotlit || line.id === focus);
  const spread = spreadLabels(
    labelled.map((line) => y(line.forecast.ifStopped)),
    plotTop + LABEL_GAP / 2,
    plotBottom - LABEL_GAP / 2,
    LABEL_GAP,
  );
  const labelY = new Map(labelled.map((line, i) => [line.id, spread[i]]));
  // Context lines draw first so the spotlit courses stay on top.
  const drawOrder = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => Number(a.index < spotlit) - Number(b.index < spotlit));

  const legendItem = (line: ForecastLine, index: number) => (
    <li key={line.id}>
      <button
        type="button"
        onPointerEnter={() => setFocus(line.id)}
        onPointerLeave={() => setFocus(null)}
        onFocus={() => setFocus(line.id)}
        onBlur={() => setFocus(null)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 transition-colors hover:bg-ink/5"
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: colour(index) }}
        />
        <span className="max-w-[14rem] truncate" title={line.name}>
          {line.name}
        </span>
        {STATUS_LABEL[line.status] && (
          <span className={line.status === 'behind' ? 'text-warning-fg' : 'text-ink-faint'}>
            {STATUS_LABEL[line.status]}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* The title keeps to the top edge, level with the legend's first 44px row, however
          many rows the legend wraps to. */}
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-6">
        <h2 id={titleId} className="shrink-0 font-display text-2xl sm:py-1.5">
          Exam-day forecast
        </h2>
        <ul className="-mx-2 flex flex-wrap gap-x-3 gap-y-0 text-sm text-ink-soft sm:justify-end sm:gap-x-4" aria-label="Courses">
          {lines.slice(0, spotlit).map((line, index) => legendItem(line, index))}
          {expanded && lines.slice(spotlit).map((line, index) => legendItem(line, spotlit + index))}
          {hidden > 0 && (
            <li>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((open) => !open)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
              >
                {expanded ? 'Fewer' : `${hidden} more`}
              </button>
            </li>
          )}
          {sharedTarget && (
            <li className="inline-flex min-h-11 items-center gap-2 px-2 text-ink">
              <span aria-hidden="true" className="w-[18px] border-t-[1.5px] border-dashed border-ink" />
              Target <strong className="font-bold tabular-nums">{Math.round(target * 100)}%</strong>
            </li>
          )}
        </ul>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-desc`}
      >
        <desc id={`${titleId}-desc`}>
          {lines
            .map(
              (line) =>
                `${line.name}: ${Math.round(line.forecast.ifStopped * 100)}% recalled ${
                  line.forecast.hasExam ? `on ${formatDate(line.forecast.end)}` : 'in four weeks'
                } if you stop now`,
            )
            .join('. ')}
        </desc>
        <g className="fill-ink-faint text-[12px] tabular-nums" style={{ fontFamily: 'var(--font-body)' }}>
          {ticks.map((tick) => {
            const isTarget = sharedTarget && Math.abs(tick - target) < 0.005;
            return (
              <text
                key={tick}
                x={LEFT - 12}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="central"
                className={isTarget ? 'fill-ink font-bold' : undefined}
              >
                {Math.round(tick * 100)}
              </text>
            );
          })}
          {marks.map((mark) => (
            <text
              key={mark.at}
              x={x(mark.at)}
              y={H - 10}
              textAnchor={mark.anchor}
              className={mark.strong ? 'fill-ink' : undefined}
            >
              {mark.label}
            </text>
          ))}
          {beyond !== undefined && (
            <text x={W - RIGHT} y={H - 10} textAnchor="end" className="fill-ink">
              Exam {formatShortDate(beyond)} →
            </text>
          )}
        </g>
        <line x1={LEFT} x2={W - RIGHT} y1={plotBottom} y2={plotBottom} className="stroke-line" />
        {[now, ...inside].map((at) => (
          <line key={at} x1={x(at)} x2={x(at)} y1={plotTop} y2={plotBottom} className="stroke-line" />
        ))}
        {sharedTarget && (
          <line
            x1={LEFT}
            x2={W - RIGHT}
            y1={y(target)}
            y2={y(target)}
            className="stroke-ink"
            strokeWidth={1.2}
            strokeDasharray="3 5"
            strokeOpacity={0.7}
          />
        )}
        {drawOrder.map(({ line, index }) => {
          const context = index >= spotlit;
          const focused = focus === line.id;
          const stroke = context && focused ? 'hsl(var(--ink))' : colour(index);
          const eased = easeSeries(line.history.map((point) => point.recall));
          const points = line.history.map((point, i) => ({ x: x(point.at), y: y(eased[i]) }));
          const last = points[points.length - 1];
          const dimmed = focus !== null && !focused;
          const delay = 0.15 + Math.min(index, spotlit) * 0.12;
          return (
            <g
              key={line.id}
              style={{
                opacity: dimmed ? 0.18 : context && !focused ? 0.45 : 1,
                transition: `opacity ${200 * multiplier}ms`,
              }}
            >
              <motion.path
                d={smoothPath(points)}
                fill="none"
                stroke={stroke}
                strokeWidth={context ? (focused ? 3.5 : 2) : focused ? 4.5 : 3.5}
                strokeLinecap="round"
                initial={draw ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.1 * multiplier, delay: delay * multiplier, ease: MOTION_EASING.emphasised }}
              />
              {last && (!context || focused) && (
                <>
                  <motion.circle
                    cx={last.x}
                    cy={last.y}
                    r={5}
                    fill={stroke}
                    initial={draw ? { scale: 0 } : false}
                    animate={{ scale: 1 }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    transition={
                      draw
                        ? { type: 'spring', stiffness: 520, damping: 14, delay: (delay + 1) * multiplier }
                        : { duration: 0 }
                    }
                  />
                  {draw && !context && (
                    <motion.circle
                      cx={last.x}
                      cy={last.y}
                      r={5}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={2}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                      initial={{ scale: 1, opacity: 0 }}
                      animate={{ scale: [1, 3.2], opacity: [0.6, 0] }}
                      transition={{ duration: 0.9 * multiplier, delay: (delay + 1.05) * multiplier, ease: 'easeOut' }}
                    />
                  )}
                  <text
                    x={last.x + 12}
                    y={labelY.get(line.id) ?? last.y}
                    dominantBaseline="central"
                    fill={stroke}
                    className="stroke-surface font-display text-xl font-semibold tabular-nums"
                    strokeWidth={6}
                    paintOrder="stroke"
                  >
                    {Math.round(line.forecast.ifStopped * 100)}%
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
