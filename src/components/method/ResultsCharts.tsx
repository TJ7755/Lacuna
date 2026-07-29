import { useState } from 'react';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

/** Hold-out results from tooling/short-term-memory/BENCHMARK.md, verbatim. */
const MODELS = [
  { name: 'FSRS-6', note: 'old baseline', barClass: 'bg-negative/70' },
  { name: 'Half-life-logistic', note: 'selected', barClass: 'bg-accent' },
  { name: 'ACT-R multi-trace', note: 'runner-up', barClass: 'bg-ink-faint/60' },
] as const;

type MetricKey = 'logLoss' | 'brier' | 'calibration';

const METRICS: Record<
  MetricKey,
  { label: string; values: [number, number, number]; decimals: number; caption: string }
> = {
  logLoss: {
    label: 'Log loss',
    values: [2.66, 0.4, 0.44],
    decimals: 2,
    caption: 'The metric that punishes confident wrong answers hardest. Lower is better.',
  },
  brier: {
    label: 'Brier score',
    values: [0.169, 0.129, 0.14],
    decimals: 3,
    caption:
      'Plain squared error between prediction and outcome — gentler on confident misses, and the gap is still clear. Lower is better.',
  },
  calibration: {
    label: 'Calibration',
    values: [0.135, 0.012, 0.024],
    decimals: 3,
    caption:
      'The gap between "the model says 80%" and "it was right 80% of the time". FSRS-6’s confidence is badly overstated at these lags; half-life-logistic’s is close to honest.',
  },
};

/**
 * Overall hold-out scores as one chart with a metric switch. Bars re-scale
 * with an eased transition when the metric changes, so the comparison stays
 * in one place instead of three stacked charts.
 */
export function OverallResults() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  const [metric, setMetric] = useState<MetricKey>('logLoss');
  const { values, decimals, caption } = METRICS[metric];
  const max = Math.max(...values);

  return (
    <div ref={ref} className="mt-6 rounded-[10px] border border-line bg-surface p-5 shadow-paper">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Benchmark metric">
        {(Object.keys(METRICS) as MetricKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={metric === key}
            onClick={() => setMetric(key)}
            className={
              'rounded-full border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ' +
              (metric === key
                ? 'border-accent bg-accent-soft/70 text-accent-ink'
                : 'border-line text-ink-soft hover:border-line-strong hover:text-ink')
            }
          >
            {METRICS[key].label}
          </button>
        ))}
      </div>

      <ul className="mt-5 space-y-4">
        {MODELS.map((m, i) => {
          const value = values[i];
          return (
            <li key={m.name}>
              <div className="mb-1 flex items-baseline justify-between gap-4">
                <span className="font-mono text-[11px] text-ink-soft">
                  {m.name} <span className="text-ink-faint">· {m.note}</span>
                </span>
                <span className="font-mono text-[11px] tabular-nums text-ink">{value.toFixed(decimals)}</span>
              </div>
              <div className="h-4 rounded-sm bg-ink/[0.04]">
                <div
                  className={'h-full rounded-sm ' + m.barClass}
                  style={{
                    width: visible ? `${(value / max) * 100}%` : 0,
                    transition: `width 800ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 100}ms`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft" aria-live="polite">
        {caption}
      </p>
    </div>
  );
}

/** Log loss by time since the card was last seen — the short-lag story. */
const LAG_BUCKETS = [
  { label: '<1m', fsrs: 6.03, halfLife: 0.5 },
  { label: '1–10m', fsrs: 4.7, halfLife: 0.43 },
  { label: '10–60m', fsrs: 2.02, halfLife: 0.25 },
  { label: '1–6h', fsrs: 2.91, halfLife: 0.31 },
  { label: '6–24h', fsrs: 4.37, halfLife: 0.45 },
  { label: '1–7d', fsrs: 0.45, halfLife: 0.47 },
];

const LAG_MAX = 6.4; // headroom above the tallest bar
const PLOT_TOP = 36;
const PLOT_BOTTOM = 250;
const PLOT_LEFT = 34;
const GROUP_W = 86;
const BAR_W = 30;

function lagY(v: number): number {
  return PLOT_BOTTOM - (v / LAG_MAX) * (PLOT_BOTTOM - PLOT_TOP);
}

/**
 * Grouped bars, growing up from the baseline in a stagger as the chart
 * scrolls into view. The amber-red bars are the old day-only baseline; the
 * accent bars are the shipped short-term model.
 */
export function LagResults() {
  const { ref, visible } = useRevealOnScroll<HTMLElement>();

  const bar = (x: number, v: number, fill: string, delay: number, key: string) => (
    <rect
      key={key}
      x={x}
      width={BAR_W}
      fill={fill}
      rx="2"
      y={visible ? lagY(v) : PLOT_BOTTOM}
      height={visible ? PLOT_BOTTOM - lagY(v) : 0}
      style={{ transition: `y 700ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, height 700ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms` }}
    />
  );

  return (
    <figure ref={ref} className="mt-6 rounded-[10px] border border-line bg-surface p-5 shadow-paper">
      <svg
        viewBox="0 0 560 290"
        className="w-full"
        role="img"
        aria-label="Log loss by time since last review: FSRS-6 spikes to 6.03 under a minute while the short-term model stays near 0.5; the two agree by one week"
      >
        {[1, 2, 3, 4, 5, 6].map((l) => (
          <line key={l} x1={PLOT_LEFT} y1={lagY(l)} x2={548} y2={lagY(l)} stroke="hsl(var(--line))" strokeDasharray="2 4" />
        ))}
        <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={548} y2={PLOT_BOTTOM} stroke="hsl(var(--line-strong))" />
        {[2, 4, 6].map((l) => (
          <text key={l} x={PLOT_LEFT - 6} y={lagY(l) + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">
            {l}
          </text>
        ))}

        {LAG_BUCKETS.map((b, i) => {
          const gx = PLOT_LEFT + 12 + i * GROUP_W;
          return (
            <g key={b.label}>
              {bar(gx, b.fsrs, 'hsl(var(--negative) / 0.7)', 100 + i * 70, 'f')}
              {bar(gx + BAR_W + 6, b.halfLife, 'hsl(var(--accent))', 160 + i * 70, 'h')}
              <text
                x={gx + BAR_W / 2}
                y={lagY(b.fsrs) - 6}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="10"
                fill="hsl(var(--ink-soft))"
                style={{ opacity: visible ? 1 : 0, transition: `opacity 500ms ease ${500 + i * 70}ms` }}
              >
                {b.fsrs.toFixed(2)}
              </text>
              <text
                x={gx + BAR_W + 6 + BAR_W / 2}
                y={lagY(b.halfLife) - 6}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="10"
                fill="hsl(var(--ink-soft))"
                style={{ opacity: visible ? 1 : 0, transition: `opacity 500ms ease ${560 + i * 70}ms` }}
              >
                {b.halfLife.toFixed(2)}
              </text>
              <text x={gx + BAR_W + 3} y={PLOT_BOTTOM + 18} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fill="hsl(var(--ink-faint))">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-sm bg-negative/70" aria-hidden />
          FSRS-6 · log loss, lower is better
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-sm bg-accent" aria-hidden />
          half-life-logistic
        </span>
      </figcaption>
    </figure>
  );
}
