import { CheckIcon } from '../ui/icons';

const SIZE = 48;
const STROKE = 4.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Today's reviews beside a course's Study button: the cards still due in the centre,
 * and an arc that fills as the day's reviews are done. Nothing due completes the ring
 * with a tick, as Today marks a course done.
 */
export function DueRing({ due, done }: { due: number; done: number }) {
  const complete = due === 0;
  const fraction = complete ? 1 : done / (done + due);
  return (
    <span
      role="img"
      aria-label={
        complete ? 'Nothing due today' : `${due} ${due === 1 ? 'card' : 'cards'} due today`
      }
      className="relative inline-grid h-12 w-12 shrink-0 place-items-center"
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-line"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className={complete ? 'stroke-positive' : 'stroke-accent'}
          style={{ transition: 'stroke-dashoffset 400ms ease-out' }}
        />
      </svg>
      {complete ? (
        <CheckIcon width={20} height={20} className="relative text-positive" aria-hidden="true" />
      ) : (
        <span className="relative font-display text-base font-bold leading-none text-ink tabular-nums">
          {due}
        </span>
      )}
    </span>
  );
}
