import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { SECTION_CARD_SURFACE_CLASS } from '../ui/SectionCard';
import { useDragX } from './useDragX';

const VIEW_W = 560;
const PLOT_LEFT = 40;
const PLOT_RIGHT = 520;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 208;
const Z_MIN = -6;
const Z_MAX = 6;

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function zToX(z: number): number {
  return PLOT_LEFT + ((z - Z_MIN) / (Z_MAX - Z_MIN)) * (PLOT_RIGHT - PLOT_LEFT);
}

function xToZ(x: number): number {
  const clamped = Math.min(PLOT_RIGHT, Math.max(PLOT_LEFT, x));
  return Z_MIN + ((clamped - PLOT_LEFT) / (PLOT_RIGHT - PLOT_LEFT)) * (Z_MAX - Z_MIN);
}

function pToY(p: number): number {
  return PLOT_BOTTOM - p * (PLOT_BOTTOM - PLOT_TOP);
}

const CURVE_POINTS = (() => {
  const pts: string[] = [];
  for (let z = Z_MIN; z <= Z_MAX + 1e-9; z += 0.25) {
    pts.push(`${zToX(z).toFixed(1)},${pToY(sigmoid(z)).toFixed(1)}`);
  }
  return pts.join(' ');
})();

/**
 * The sigmoid, made touchable. A draggable
 * marker slides along it, showing how any weighted sum z lands on a valid
 * probability between 0 and 1.
 */
export function SigmoidExplorer() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [z, setZ] = useState(1.2);
  const { handlers } = useDragX(svgRef, VIEW_W, (x) => setZ(xToZ(x)));

  const p = sigmoid(z);
  const markerX = zToX(z);
  const markerY = pToY(p);

  function onKeyDown(e: ReactKeyboardEvent<SVGRectElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setZ((v) => Math.min(Z_MAX, v + 0.5));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setZ((v) => Math.max(Z_MIN, v - 0.5));
    }
  }

  return (
    <figure className={`${SECTION_CARD_SURFACE_CLASS} mt-6 p-5 sm:p-6`}>
      <svg
        ref={svgRef}
        viewBox="0 0 560 240"
        className="w-full touch-none select-none"
        role="group"
        aria-label="Interactive sigmoid curve mapping any weighted sum to a probability between 0 and 1"
      >
        {/* Axes and the two guide lines the curve is anchored to. */}
        <line
          x1={PLOT_LEFT}
          y1={PLOT_BOTTOM}
          x2={PLOT_RIGHT}
          y2={PLOT_BOTTOM}
          stroke="hsl(var(--line-strong))"
        />
        <line
          x1={PLOT_LEFT}
          y1={PLOT_TOP}
          x2={PLOT_LEFT}
          y2={PLOT_BOTTOM}
          stroke="hsl(var(--line-strong))"
        />
        <line
          x1={PLOT_LEFT}
          y1={pToY(0.5)}
          x2={PLOT_RIGHT}
          y2={pToY(0.5)}
          stroke="hsl(var(--line))"
          strokeDasharray="4 4"
        />
        <line
          x1={zToX(0)}
          y1={PLOT_TOP}
          x2={zToX(0)}
          y2={PLOT_BOTTOM}
          stroke="hsl(var(--line))"
          strokeDasharray="4 4"
        />

        <polyline
          points={CURVE_POINTS}
          fill="none"
          stroke="hsl(var(--accent-ink))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Marker: a dot pinned to the curve, with drop lines to both axes. */}
        <line
          x1={markerX}
          y1={markerY}
          x2={markerX}
          y2={PLOT_BOTTOM}
          stroke="hsl(var(--accent-ink) / 0.35)"
        />
        <line
          x1={PLOT_LEFT}
          y1={markerY}
          x2={markerX}
          y2={markerY}
          stroke="hsl(var(--accent-ink) / 0.35)"
        />
        <circle cx={markerX} cy={markerY} r="6" fill="hsl(var(--accent-ink))" />

        {/* Axis annotations. */}
        <text
          x={PLOT_LEFT - 6}
          y={PLOT_TOP + 4}
          textAnchor="end"
          fontFamily="var(--font-body)"
          fontSize="12"
          fill="hsl(var(--ink-faint))"
        >
          1
        </text>
        <text
          x={PLOT_LEFT - 6}
          y={pToY(0.5) + 4}
          textAnchor="end"
          fontFamily="var(--font-body)"
          fontSize="12"
          fill="hsl(var(--ink-faint))"
        >
          .5
        </text>
        <text
          x={PLOT_LEFT - 6}
          y={PLOT_BOTTOM + 4}
          textAnchor="end"
          fontFamily="var(--font-body)"
          fontSize="12"
          fill="hsl(var(--ink-faint))"
        >
          0
        </text>
        <text
          x={PLOT_LEFT}
          y={PLOT_BOTTOM + 20}
          fontFamily="var(--font-body)"
          fontSize="12"
          fill="hsl(var(--ink-faint))"
        >
          z = −6
        </text>
        <text
          x={zToX(0)}
          y={PLOT_BOTTOM + 20}
          textAnchor="middle"
          fontFamily="var(--font-body)"
          fontSize="12"
          fill="hsl(var(--ink-faint))"
        >
          z = 0
        </text>
        <text
          x={PLOT_RIGHT}
          y={PLOT_BOTTOM + 20}
          textAnchor="end"
          fontFamily="var(--font-body)"
          fontSize="12"
          fill="hsl(var(--ink-faint))"
        >
          z = +6
        </text>

        {/* Drag surface across the whole plot. */}
        <rect
          x={PLOT_LEFT}
          y={PLOT_TOP - 10}
          width={PLOT_RIGHT - PLOT_LEFT}
          height={PLOT_BOTTOM - PLOT_TOP + 30}
          fill="transparent"
          className="cursor-ew-resize"
          role="slider"
          aria-label="Weighted sum z"
          aria-valuemin={Z_MIN}
          aria-valuemax={Z_MAX}
          aria-valuenow={Math.round(z * 10) / 10}
          aria-valuetext={`z ${z.toFixed(1)}, recall probability ${Math.round(p * 100)}%`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          {...handlers}
        />
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 font-body text-sm text-ink-faint">
        <span className="text-ink-soft">
          z = {z >= 0 ? '+' : ''}
          {z.toFixed(1)} → P(recall) = {Math.round(p * 100)}%
        </span>
      </figcaption>
    </figure>
  );
}
