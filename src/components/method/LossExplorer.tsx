import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import { useDragX } from './useDragX';

const VIEW_W = 560;
const PLOT_LEFT = 40;
const PLOT_RIGHT = 520;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 208;
const P_MIN = 0.02;
const P_MAX = 0.98;
const LOSS_CAP = 4; // display ceiling; both curves run to infinity at the edges

function pToX(p: number): number {
  return PLOT_LEFT + p * (PLOT_RIGHT - PLOT_LEFT);
}

function xToP(x: number): number {
  const clamped = Math.min(PLOT_RIGHT, Math.max(PLOT_LEFT, x));
  const p = (clamped - PLOT_LEFT) / (PLOT_RIGHT - PLOT_LEFT);
  return Math.min(P_MAX, Math.max(P_MIN, p));
}

function lossToY(loss: number): number {
  return PLOT_BOTTOM - (Math.min(loss, LOSS_CAP) / LOSS_CAP) * (PLOT_BOTTOM - PLOT_TOP);
}

function curvePoints(loss: (p: number) => number): string {
  const pts: string[] = [];
  for (let p = P_MIN; p <= P_MAX + 1e-9; p += 0.01) {
    pts.push(`${pToX(p).toFixed(1)},${lossToY(loss(p)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const RECALLED_POINTS = curvePoints((p) => -Math.log(p)); // outcome: remembered
const FORGOTTEN_POINTS = curvePoints((p) => -Math.log(1 - p)); // outcome: forgotten

/**
 * Log loss, made touchable. Drag the prediction left and right and watch what
 * the same prediction costs when the learner remembered versus forgot —
 * confident and wrong is punished without mercy.
 */
export function LossExplorer() {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [p, setP] = useState(0.9);
  const { dragging, handlers } = useDragX(svgRef, VIEW_W, (x) => setP(xToP(x)));

  const lossRecalled = -Math.log(p);
  const lossForgotten = -Math.log(1 - p);
  const markerX = pToX(p);

  function onKeyDown(e: ReactKeyboardEvent<SVGRectElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setP((v) => Math.min(P_MAX, v + 0.05));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setP((v) => Math.max(P_MIN, v - 0.05));
    }
  }

  const drawStyle = (delay: number) => ({
    transition: `stroke-dashoffset 1400ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms`,
  });

  return (
    <figure ref={ref} className="mt-6 rounded-[10px] border border-line bg-surface p-5 shadow-paper">
      <svg
        ref={svgRef}
        viewBox="0 0 560 240"
        className="w-full touch-none select-none"
        role="group"
        aria-label="Interactive chart of log loss against predicted probability, for a remembered outcome and a forgotten one"
      >
        <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="hsl(var(--line-strong))" />
        <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={PLOT_BOTTOM} stroke="hsl(var(--line-strong))" />
        {[1, 2, 3].map((l) => (
          <line
            key={l}
            x1={PLOT_LEFT}
            y1={lossToY(l)}
            x2={PLOT_RIGHT}
            y2={lossToY(l)}
            stroke="hsl(var(--line))"
            strokeDasharray="2 4"
          />
        ))}

        <polyline
          points={RECALLED_POINTS}
          fill="none"
          stroke="hsl(var(--positive))"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={visible ? 0 : 1}
          style={drawStyle(200)}
        />
        <polyline
          points={FORGOTTEN_POINTS}
          fill="none"
          stroke="hsl(var(--negative))"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={visible ? 0 : 1}
          style={drawStyle(500)}
        />

        {/* The prediction being made, and what it costs either way. */}
        <line
          x1={markerX}
          y1={PLOT_TOP}
          x2={markerX}
          y2={PLOT_BOTTOM}
          stroke="hsl(var(--line-strong))"
          style={{ transition: dragging ? 'none' : 'x1 200ms ease, x2 200ms ease' }}
        />
        <circle
          cx={markerX}
          cy={lossToY(lossRecalled)}
          r="5"
          fill="hsl(var(--positive))"
          style={{ transition: dragging ? 'none' : 'cx 200ms ease, cy 200ms ease' }}
        />
        <circle
          cx={markerX}
          cy={lossToY(lossForgotten)}
          r="5"
          fill="hsl(var(--negative))"
          style={{ transition: dragging ? 'none' : 'cx 200ms ease, cy 200ms ease' }}
        />

        <text x={PLOT_LEFT - 6} y={PLOT_TOP + 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">{LOSS_CAP}+</text>
        <text x={PLOT_LEFT - 6} y={PLOT_BOTTOM + 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">0</text>
        <text x={PLOT_LEFT} y={PLOT_BOTTOM + 20} fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">predicts certain to forget</text>
        <text x={PLOT_RIGHT} y={PLOT_BOTTOM + 20} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">predicts certain to recall</text>

        <rect
          x={PLOT_LEFT}
          y={PLOT_TOP - 10}
          width={PLOT_RIGHT - PLOT_LEFT}
          height={PLOT_BOTTOM - PLOT_TOP + 30}
          fill="transparent"
          className="cursor-ew-resize"
          role="slider"
          aria-label="Predicted probability of recall"
          aria-valuemin={P_MIN}
          aria-valuemax={P_MAX}
          aria-valuenow={Math.round(p * 100) / 100}
          aria-valuetext={`prediction ${Math.round(p * 100)}%: loss ${lossRecalled.toFixed(2)} if remembered, ${lossForgotten.toFixed(2)} if forgotten`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          {...handlers}
        />
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 font-mono text-[11px] text-ink-faint">
        <span>
          prediction: <span className="text-ink-soft">{Math.round(p * 100)}% likely to recall</span>
        </span>
        <span className="flex flex-wrap gap-x-5 gap-y-1">
          <span className="text-positive">remembered → {lossRecalled.toFixed(2)}</span>
          <span className="text-negative">forgot → {lossForgotten.toFixed(2)}</span>
        </span>
      </figcaption>
    </figure>
  );
}
