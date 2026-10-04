import { useId, useMemo, useState } from 'react';
import { m as motion } from 'motion/react';
import { MOTION_EASING } from '../ui/motion';
import { formatDate, formatShortDate } from '../../utils/datetime';
import type { CourseForecast } from '../../fsrs/courseForecast';

export type ForecastStatus = 'ahead' | 'behind' | 'steady';

export interface ForecastLine {
  id: string;
  name: string;
  status: ForecastStatus;
  forecast: CourseForecast;
}

export const STATUS_COLOUR: Record<ForecastStatus, string> = {
  ahead: 'hsl(var(--positive))',
  behind: 'hsl(var(--warning))',
  steady: 'hsl(var(--ink-faint))',
};

const STATUS_TEXT: Record<ForecastStatus, string> = {
  ahead: 'text-positive',
  behind: 'text-warning-fg',
  steady: 'text-ink-soft',
};

export function forecastStatus(forecast: CourseForecast): ForecastStatus {
  if (!forecast.hasExam) return 'steady';
  return forecast.atEnd + 0.005 >= forecast.target ? 'ahead' : 'behind';
}

const W = 640;
const H = 240;
const LEFT = 40;
const RIGHT = 16;
const TOP = 14;
const BOTTOM = 34;

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

/**
 * Exam-day forecast: each course's expected recall from today to its exam, on a shared,
 * proportional date axis, against the target. Lines draw in, the exam-day points land
 * with a small spring, and choosing a course in the legend brings its line forward.
 */
export function ForecastChart({
  lines,
  now,
  multiplier,
}: {
  lines: ForecastLine[];
  now: number;
  multiplier: number;
}) {
  const titleId = useId();
  const [focus, setFocus] = useState<string | null>(null);
  const target = lines[0]?.forecast.target ?? 0.9;
  const sharedTarget = lines.every((line) => Math.abs(line.forecast.target - target) < 0.005);

  const geometry = useMemo(() => {
    const end = Math.max(now + 14 * 86_400_000, ...lines.map((line) => line.forecast.end));
    const ticks = recallTicks([
      target,
      ...lines.flatMap((line) => line.forecast.outlook.map((point) => point.recall)),
    ]);
    const top = ticks[0];
    const bottom = ticks[ticks.length - 1];
    const x = (at: number) => LEFT + ((at - now) / (end - now)) * (W - LEFT - RIGHT);
    const y = (recall: number) =>
      TOP + ((top - Math.max(bottom, Math.min(top, recall))) / (top - bottom)) * (H - TOP - BOTTOM);
    // Date labels: today, then each exam, dropping any that would collide.
    const marks: { at: number; label: string; strong: boolean }[] = [
      { at: now, label: 'Today', strong: false },
    ];
    for (const line of [...lines].sort((a, b) => a.forecast.end - b.forecast.end)) {
      if (!line.forecast.hasExam) continue;
      const tooClose = marks.some((mark) => Math.abs(x(mark.at) - x(line.forecast.end)) < 64);
      if (!tooClose)
        marks.push({ at: line.forecast.end, label: formatShortDate(line.forecast.end), strong: true });
    }
    return { x, y, ticks, marks };
  }, [lines, now, target]);

  const { x, y, ticks, marks } = geometry;
  const draw = multiplier > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id={titleId} className="font-display text-2xl">
          Exam-day forecast
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-soft" aria-label="Courses">
          {lines.map((line) => (
            <li key={line.id}>
              <button
                type="button"
                aria-pressed={focus === line.id}
                onPointerEnter={() => setFocus(line.id)}
                onPointerLeave={() => setFocus(null)}
                onFocus={() => setFocus(line.id)}
                onBlur={() => setFocus(null)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 transition-colors hover:bg-ink/5"
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: STATUS_COLOUR[line.status] }}
                />
                {line.name}
                <strong className={'font-bold tabular-nums ' + STATUS_TEXT[line.status]}>
                  {Math.round(line.forecast.atEnd * 100)}%
                </strong>
              </button>
            </li>
          ))}
          {sharedTarget && (
            <li className="inline-flex min-h-11 items-center gap-2 px-2 text-ink">
              <span aria-hidden="true" className="w-[18px] border-t-[1.5px] border-dashed border-ink" />
              Target <strong className="font-bold tabular-nums">{Math.round(target * 100)}%</strong>
            </li>
          )}
        </ul>
      </div>
      <svg
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
                `${line.name}: ${Math.round(line.forecast.atEnd * 100)}% ${
                  line.forecast.hasExam ? `on ${formatDate(line.forecast.end)}` : 'kept fresh'
                }`,
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
          {marks.map((mark, index) => (
            <text
              key={mark.at}
              x={x(mark.at)}
              y={H - 10}
              textAnchor={index === 0 ? 'start' : 'middle'}
              className={mark.strong ? 'fill-ink' : undefined}
            >
              {mark.label}
            </text>
          ))}
        </g>
        <line
          x1={LEFT}
          x2={W - RIGHT}
          y1={y(ticks[ticks.length - 1])}
          y2={y(ticks[ticks.length - 1])}
          className="stroke-line"
        />
        {lines.map((line, index) => {
          const points = line.forecast.outlook.map((point) => ({ x: x(point.at), y: y(point.recall) }));
          const last = points[points.length - 1];
          const dimmed = focus !== null && focus !== line.id;
          const delay = 0.15 + index * 0.12;
          return (
            <g
              key={line.id}
              style={{ opacity: dimmed ? 0.18 : 1, transition: `opacity ${200 * multiplier}ms` }}
            >
              <motion.path
                d={smoothPath(points)}
                fill="none"
                stroke={STATUS_COLOUR[line.status]}
                strokeWidth={focus === line.id ? 4.5 : 3.5}
                strokeLinecap="round"
                initial={draw ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.1 * multiplier, delay: delay * multiplier, ease: MOTION_EASING.emphasised }}
              />
              {line.forecast.hasExam && last && (
                <>
                  <motion.circle
                    cx={last.x}
                    cy={last.y}
                    r={5}
                    fill={STATUS_COLOUR[line.status]}
                    initial={draw ? { scale: 0 } : false}
                    animate={{ scale: 1 }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    transition={
                      draw
                        ? { type: 'spring', stiffness: 520, damping: 14, delay: (delay + 1) * multiplier }
                        : { duration: 0 }
                    }
                  />
                  {draw && (
                    <motion.circle
                      cx={last.x}
                      cy={last.y}
                      r={5}
                      fill="none"
                      stroke={STATUS_COLOUR[line.status]}
                      strokeWidth={2}
                      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                      initial={{ scale: 1, opacity: 0 }}
                      animate={{ scale: [1, 3.2], opacity: [0.6, 0] }}
                      transition={{ duration: 0.9 * multiplier, delay: (delay + 1.05) * multiplier, ease: 'easeOut' }}
                    />
                  )}
                </>
              )}
            </g>
          );
        })}
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
      </svg>
    </div>
  );
}
