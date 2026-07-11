import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

/** Retrievability sketch: a forgetting curve bent so it peaks on exam day. */
export function ExamCurve() {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();
  return (
    <figure ref={ref} className="mt-6 rounded-[10px] border border-line bg-surface p-5 shadow-paper">
      <svg viewBox="0 0 560 180" className="w-full" role="img" aria-label="Recall probability scheduled to peak on the exam date rather than decay between fixed intervals">
        {/* Decaying interval-based recall, the conventional approach. */}
        <path
          d="M20 40 C 80 130, 110 55, 130 55 C 190 145, 220 70, 240 70 C 310 155, 350 90, 380 90 C 440 160, 480 120, 500 120"
          fill="none"
          stroke="hsl(var(--ink-faint))"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 800ms ease 200ms' }}
        />
        {/* Exam-objective scheduling: retrievability shepherded upwards to exam
            day, traced live as the figure scrolls into view. */}
        <path
          d="M20 40 C 90 110, 150 60, 210 78 C 290 100, 380 55, 500 28"
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={visible ? 0 : 1}
          style={{ transition: 'stroke-dashoffset 1600ms cubic-bezier(0.4, 0, 0.2, 1) 300ms' }}
        />
        {/* Exam-day marker. */}
        <line x1="500" y1="14" x2="500" y2="166" stroke="hsl(var(--line-strong))" strokeWidth="1" />
        <circle cx="500" cy="28" r="4.5" fill="hsl(var(--accent))" className={visible ? 'exam-pulse' : ''} />
        <text x="492" y="176" textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">
          exam day
        </text>
        <text x="20" y="176" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">
          today
        </text>
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 bg-accent" aria-hidden />
          scheduled against the exam
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-px w-5 border-t border-dashed border-ink-faint" aria-hidden />
          left to fixed intervals
        </span>
      </figcaption>
    </figure>
  );
}
