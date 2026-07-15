import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

/** Allowed exam horizons for the landing-page toy (weeks from today). */
const EXAM_WEEK_OPTIONS = [4, 6, 8, 12, 16, 20, 24] as const;
export type ExamWeeks = (typeof EXAM_WEEK_OPTIONS)[number];

const MIN_WEEKS = EXAM_WEEK_OPTIONS[0];
const MAX_WEEKS = EXAM_WEEK_OPTIONS[EXAM_WEEK_OPTIONS.length - 1];

/** Map weeks onto the SVG x-axis for the exam marker. */
function weeksToX(weeks: number): number {
  const t = (weeks - MIN_WEEKS) / (MAX_WEEKS - MIN_WEEKS);
  return 360 + t * 140; // 360 … 500
}

function xToWeeks(x: number): ExamWeeks {
  const clamped = Math.min(500, Math.max(360, x));
  const t = (clamped - 360) / 140;
  const raw = MIN_WEEKS + t * (MAX_WEEKS - MIN_WEEKS);
  let best: ExamWeeks = EXAM_WEEK_OPTIONS[0];
  let bestDist = Infinity;
  for (const w of EXAM_WEEK_OPTIONS) {
    const d = Math.abs(w - raw);
    if (d < bestDist) {
      bestDist = d;
      best = w;
    }
  }
  return best;
}

/**
 * Build a "shepherded" retrievability path that peaks at examX.
 * Closer exams get a steeper late rise (denser reviews); distant ones climb more gradually.
 */
function shepherdedPath(examX: number, weeks: number): string {
  const peakY = 28;
  // Mid control: further exams sit lower mid-path (more room to build).
  const midY = 55 + Math.min(30, weeks * 0.9);
  const midX = 20 + (examX - 20) * 0.45;
  const lateX = 20 + (examX - 20) * 0.75;
  const lateY = peakY + 18 + weeks * 0.4;
  return `M20 40 C 90 ${110 + weeks * 0.5}, ${midX} ${midY}, ${lateX} ${lateY} S ${examX - 20} ${peakY + 8}, ${examX} ${peakY}`;
}

/** Conventional fixed-interval forgetting curve (static contrast). */
const INTERVAL_PATH =
  'M20 40 C 80 130, 110 55, 130 55 C 190 145, 220 70, 240 70 C 310 155, 350 90, 380 90 C 440 160, 480 120, 500 120';

type ExamCurveProps = {
  weeks: ExamWeeks;
  onWeeksChange?: (weeks: ExamWeeks) => void;
};

/** Retrievability sketch: a forgetting curve bent so it peaks on exam day. */
export function ExamCurve({ weeks, onWeeksChange }: ExamCurveProps) {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const examX = weeksToX(weeks);
  const accentPath = shepherdedPath(examX, weeks);
  const interactive = Boolean(onWeeksChange);

  const clientToSvgX = useCallback((clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return examX;
    const rect = svg.getBoundingClientRect();
    const viewW = 560;
    return ((clientX - rect.left) / rect.width) * viewW;
  }, [examX]);

  const applyClientX = useCallback(
    (clientX: number) => {
      if (!onWeeksChange) return;
      onWeeksChange(xToWeeks(clientToSvgX(clientX)));
    },
    [clientToSvgX, onWeeksChange],
  );

  function onPointerDown(e: ReactPointerEvent<SVGRectElement>) {
    if (!interactive) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    applyClientX(e.clientX);
  }

  function onPointerMove(e: ReactPointerEvent<SVGRectElement>) {
    if (!dragging || !interactive) return;
    applyClientX(e.clientX);
  }

  function onPointerUp(e: ReactPointerEvent<SVGRectElement>) {
    if (!interactive) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  }

  function onKeyDown(e: ReactKeyboardEvent<SVGRectElement>) {
    if (!onWeeksChange) return;
    const i = EXAM_WEEK_OPTIONS.indexOf(weeks);
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onWeeksChange(EXAM_WEEK_OPTIONS[Math.min(EXAM_WEEK_OPTIONS.length - 1, i + 1)]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onWeeksChange(EXAM_WEEK_OPTIONS[Math.max(0, i - 1)]);
    }
  }

  return (
    <figure ref={ref} className="mt-6 rounded-[10px] border border-line bg-surface p-5 shadow-paper">
      <svg
        ref={svgRef}
        viewBox="0 0 560 180"
        className={'w-full ' + (interactive ? 'touch-none select-none' : '')}
        role={interactive ? 'group' : 'img'}
        aria-label="Recall probability scheduled to peak on the exam date rather than decay between fixed intervals"
      >
        {/* Decaying interval-based recall, the conventional approach. */}
        <path
          d={INTERVAL_PATH}
          fill="none"
          stroke="hsl(var(--ink-faint))"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 800ms ease 200ms' }}
        />
        {/* Exam-objective scheduling: retrievability shepherded to exam day. */}
        <path
          d={accentPath}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={visible ? 0 : 1}
          style={{
            transition: dragging
              ? 'none'
              : 'stroke-dashoffset 1600ms cubic-bezier(0.4, 0, 0.2, 1) 300ms, d 400ms ease',
          }}
        />
        {/* Exam-day marker — draggable when interactive. */}
        <line
          x1={examX}
          y1="14"
          x2={examX}
          y2="166"
          stroke="hsl(var(--line-strong))"
          strokeWidth="1"
          style={{ transition: dragging ? 'none' : 'x1 400ms ease, x2 400ms ease' }}
        />
        <circle
          cx={examX}
          cy="28"
          r="4.5"
          fill="hsl(var(--accent))"
          className={visible && !dragging ? 'exam-pulse' : ''}
          style={{ transition: dragging ? 'none' : 'cx 400ms ease' }}
        />
        {interactive && (
          <rect
            x={examX - 18}
            y="8"
            width="36"
            height="160"
            fill="transparent"
            className="cursor-ew-resize"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="slider"
            aria-label="Exam date in weeks from today"
            aria-valuemin={MIN_WEEKS}
            aria-valuemax={MAX_WEEKS}
            aria-valuenow={weeks}
            aria-valuetext={`${weeks} weeks`}
            tabIndex={0}
            onKeyDown={onKeyDown}
          />
        )}
        <text
          x={examX - 8}
          y="176"
          textAnchor="end"
          fontFamily="var(--font-mono)"
          fontSize="10"
          fill="hsl(var(--ink-faint))"
          style={{ transition: dragging ? 'none' : 'x 400ms ease' }}
        >
          exam day
        </text>
        <text x="20" y="176" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">
          today
        </text>
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 bg-accent" aria-hidden />
          scheduled against the exam
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-px w-5 border-t border-dashed border-ink-faint" aria-hidden />
          left to fixed intervals
        </span>
        {interactive && (
          <span className="text-ink-soft">
            {weeks} weeks · drag the marker
          </span>
        )}
      </figcaption>
    </figure>
  );
}
