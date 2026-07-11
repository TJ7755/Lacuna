// Compact ring gauge for the mastery stat in CourseHeader. Deliberately distinct
// from the linear ProgressBar used on CourseCard/dashboard, so the cockpit header
// reads as its own instrument rather than a shrunk dashboard card.

const SIZE = 40;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface MasteryRingProps {
  /** Mastery fraction, 0..1. */
  value: number;
}

export function MasteryRing({ value }: MasteryRingProps) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  const offset = CIRCUMFERENCE * (1 - pct / 100);
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="shrink-0 -rotate-90"
      role="img"
      aria-label={`${pct}% mastery`}
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-ink/10"
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        className="stroke-accent transition-[stroke-dashoffset] duration-500 ease-out"
      />
    </svg>
  );
}
