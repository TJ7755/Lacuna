import { m as motion } from 'motion/react';
import { MOTION_EASING } from '../ui/motion';

// The ring opens at the top: an arc of 300 degrees from 2 o'clock round to
// 10 o'clock, leaving a gap where the four load dots sit.
const RING = 'M32.99 12.5 A15 15 0 1 1 7.01 12.5';
const DOTS: [number, number][] = [
  [13.19, 6.64],
  [17.65, 5.18],
  [22.35, 5.18],
  [26.81, 6.64],
];
const INFINITY =
  'M20 20 C17.6 17.2 13.6 17.2 13.6 20 C13.6 22.8 17.6 22.8 20 20 C22.4 17.2 26.4 17.2 26.4 20 C26.4 22.8 22.4 22.8 20 20 Z';

export type GlyphStatus = 'ahead' | 'behind' | 'steady';

const RING_COLOUR: Record<GlyphStatus, string> = {
  ahead: 'hsl(var(--positive))',
  behind: 'hsl(var(--warning))',
  steady: 'hsl(var(--ink-faint))',
};

/** How full the ring is: 50% recall reads as empty, 100% as full. */
export function glyphFill(recall: number): number {
  return Math.max(0, Math.min(1, (recall - 0.5) * 2));
}

/** Today's load as 0 to 4 lit dots, from the minutes the course needs today. */
export function glyphLoad(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes <= 3) return 1;
  if (minutes <= 8) return 2;
  if (minutes <= 15) return 3;
  return 4;
}

/**
 * A course at a glance: days to the exam in the centre (or an infinity sign when the
 * course has no date), the forecast as the ring's fill, and today's load as dots in
 * the ring's gap. Decorative; the caller supplies the accessible description.
 */
export function CourseGlyph({
  days,
  recall,
  status,
  load,
  size = 40,
  multiplier,
}: {
  /** Whole days to the exam, or null for a course without a future exam. */
  days: number | null;
  recall: number;
  status: GlyphStatus;
  load: number;
  /** Pixels, or any CSS length. */
  size?: number | string;
  multiplier: number;
}) {
  const fill = glyphFill(recall);
  return (
    <span
      aria-hidden="true"
      className="relative block shrink-0"
      style={{ width: size, height: size }}
    >
      {days !== null && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className="block font-display font-semibold leading-none text-ink tabular-nums"
            style={
              {
                fontSize: typeof size === 'number' ? size * 0.375 : `calc(${size} * 0.375)`,
                textBox: 'trim-both cap alphabetic',
              } as React.CSSProperties
            }
          >
            {days}
          </span>
        </span>
      )}
      <svg viewBox="0 0 40 40" className="block h-full w-full">
        <path
          d={RING}
          fill="none"
          className="stroke-line-strong"
          strokeWidth={3.5}
          strokeLinecap="round"
        />
        {fill > 0 && (
          <motion.path
            d={RING}
            fill="none"
            stroke={RING_COLOUR[status]}
            strokeWidth={3.5}
            strokeLinecap="round"
            initial={multiplier > 0 ? { pathLength: 0 } : false}
            animate={{ pathLength: fill }}
            transition={{ duration: 0.9 * multiplier, ease: MOTION_EASING.emphasised }}
          />
        )}
        {DOTS.map(([cx, cy], index) => (
          <circle
            key={index}
            cx={cx}
            cy={cy}
            r={1.6}
            className={index < load ? 'fill-ink' : 'fill-line-strong'}
          />
        ))}
        {days === null && (
          <path
            d={INFINITY}
            fill="none"
            className="stroke-ink"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}
