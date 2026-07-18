import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import { useDragX } from './useDragX';

const VIEW_W = 560;
const PLOT_LEFT = 40;
const PLOT_RIGHT = 520;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 168;
const DAY_MAX = 5;

// v3 routing constants, in days, mirrored from
// tooling/short-term-memory/stm_harness/candidates/common.py.
const SUCCESS_START_DAY = 21_600 / 86_400; // 0.25 — 6 hours
const SUCCESS_END_DAY = 86_400 / 86_400; // 1 — 24 hours
const FAILURE_START_DAY = 345_600 / 86_400; // 4
const FAILURE_END_DAY = 432_000 / 86_400; // 5

function dayToX(d: number): number {
  return PLOT_LEFT + (d / DAY_MAX) * (PLOT_RIGHT - PLOT_LEFT);
}

function xToDay(x: number): number {
  const clamped = Math.min(PLOT_RIGHT, Math.max(PLOT_LEFT, x));
  return ((clamped - PLOT_LEFT) / (PLOT_RIGHT - PLOT_LEFT)) * DAY_MAX;
}

function smoothstepWeight(d: number, start: number, end: number): number {
  if (d <= start) return 1;
  if (d >= end) return 0;
  const t = (d - start) / (end - start);
  return 1 - (3 * t * t - 2 * t * t * t);
}

/** Weight given to the short-term model after a successful review. */
function successWeight(d: number): number {
  return smoothstepWeight(d, SUCCESS_START_DAY, SUCCESS_END_DAY);
}

/** Weight given to the short-term model after a failed review. */
function failureWeight(d: number): number {
  return smoothstepWeight(d, FAILURE_START_DAY, FAILURE_END_DAY);
}

function weightToY(w: number): number {
  return PLOT_BOTTOM - w * (PLOT_BOTTOM - PLOT_TOP);
}

function curvePoints(weightFn: (d: number) => number): string {
  const pts: string[] = [];
  for (let d = 0; d <= DAY_MAX + 1e-9; d += 0.02) {
    pts.push(`${dayToX(d).toFixed(1)},${weightToY(weightFn(d)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const SUCCESS_POINTS = curvePoints(successWeight);
const FAILURE_POINTS = curvePoints(failureWeight);

/**
 * The handover between the two models, now conditional on the last review's
 * outcome. Drag along the days axis to see how much say the short-term model
 * has at that distance from the last review, on either path — a smooth
 * blend in both cases, never a cliff edge.
 */
export function BlendCurve() {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [day, setDay] = useState(0.6);
  const { dragging, handlers } = useDragX(svgRef, VIEW_W, (x) => setDay(xToDay(x)));

  const wSuccess = successWeight(day);
  const wFailure = failureWeight(day);
  const markerX = dayToX(day);
  const successMarkerY = weightToY(wSuccess);
  const failureMarkerY = weightToY(wFailure);
  const successPct = Math.round(wSuccess * 100);
  const failurePct = Math.round(wFailure * 100);

  function onKeyDown(e: ReactKeyboardEvent<SVGRectElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setDay((v) => Math.min(DAY_MAX, v + 0.1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setDay((v) => Math.max(0, v - 0.1));
    }
  }

  return (
    <figure ref={ref} className="mt-6 rounded-[10px] border border-line bg-surface p-5 shadow-paper">
      <svg
        ref={svgRef}
        viewBox="0 0 560 200"
        className="w-full touch-none select-none"
        role="group"
        aria-label="Weight given to the short-term model by days since last review, on two paths: after a success, full weight until six hours then fading to zero by one day; after a failure, full weight until four days then fading to zero by five days"
      >
        <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="hsl(var(--line-strong))" />
        <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_BOTTOM} stroke="hsl(var(--line-strong))" />
        {[1, 4, 5].map((d) => (
          <line key={d} x1={dayToX(d)} y1={PLOT_TOP} x2={dayToX(d)} y2={PLOT_BOTTOM} stroke="hsl(var(--line))" strokeDasharray="4 4" />
        ))}

        <polyline
          points={FAILURE_POINTS}
          fill="none"
          stroke="hsl(var(--negative))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={visible ? 0 : 1}
          style={{ transition: 'stroke-dashoffset 1400ms cubic-bezier(0.4, 0, 0.2, 1) 200ms' }}
        />
        <polyline
          points={SUCCESS_POINTS}
          fill="none"
          stroke="hsl(var(--positive))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={visible ? 0 : 1}
          style={{ transition: 'stroke-dashoffset 1400ms cubic-bezier(0.4, 0, 0.2, 1) 350ms' }}
        />

        <line
          x1={markerX}
          y1={Math.min(successMarkerY, failureMarkerY)}
          x2={markerX}
          y2={PLOT_BOTTOM}
          stroke="hsl(var(--ink-faint) / 0.35)"
          style={{ transition: dragging ? 'none' : 'x1 200ms ease, x2 200ms ease, y1 200ms ease' }}
        />
        <circle
          cx={markerX}
          cy={successMarkerY}
          r="5"
          fill="hsl(var(--positive))"
          style={{ transition: dragging ? 'none' : 'cx 200ms ease, cy 200ms ease' }}
        />
        <circle
          cx={markerX}
          cy={failureMarkerY}
          r="5"
          fill="hsl(var(--negative))"
          style={{ transition: dragging ? 'none' : 'cx 200ms ease, cy 200ms ease' }}
        />

        <text x={PLOT_LEFT - 6} y={PLOT_TOP + 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">1</text>
        <text x={PLOT_LEFT - 6} y={PLOT_BOTTOM + 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">0</text>
        <text x={dayToX(2.2)} y={PLOT_TOP + 14} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-soft))">short-term model only</text>
        <text x={dayToX(4.5)} y={PLOT_BOTTOM - 10} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-soft))">FSRS-6 only</text>
        <text x={dayToX(1)} y={PLOT_BOTTOM + 18} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">day 1</text>
        <text x={dayToX(4)} y={PLOT_BOTTOM + 18} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">day 4</text>
        <text x={dayToX(5)} y={PLOT_BOTTOM + 18} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">day 5</text>
        <text x={PLOT_LEFT} y={PLOT_BOTTOM + 18} fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">day 0</text>

        <rect
          x={PLOT_LEFT}
          y={PLOT_TOP - 10}
          width={PLOT_RIGHT - PLOT_LEFT}
          height={PLOT_BOTTOM - PLOT_TOP + 30}
          fill="transparent"
          className="cursor-ew-resize"
          role="slider"
          aria-label="Days since last review"
          aria-valuemin={0}
          aria-valuemax={DAY_MAX}
          aria-valuenow={Math.round(day * 10) / 10}
          aria-valuetext={`day ${day.toFixed(2)}: after a success, ${successPct}% short-term model; after a failure, ${failurePct}% short-term model`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          {...handlers}
        />
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono text-[11px] text-ink-faint">
        <span className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
            after a success
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-negative" aria-hidden />
            after a failure
          </span>
          <span>drag along the days axis</span>
        </span>
        <span className="text-ink-soft">
          day {day.toFixed(2)} · {successPct}% / {failurePct}% short-term
        </span>
      </figcaption>
    </figure>
  );
}
