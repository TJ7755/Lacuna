// A small circular progress ring — a general primitive for showing a 0..1
// fraction inline (e.g. next to a percentage label). Distinct from the linear
// ProgressBar; use this where space is tight and a badge reads better than a
// bar.

interface MiniRingProps {
  /** Progress fraction, 0..1. */
  value: number;
  size?: number;
  strokeWidth?: number;
}

export function MiniRing({ value, size = 18, strokeWidth = 2.5 }: MiniRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 1);
  const offset = circumference * (1 - clamped);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90 shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--line))"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}
