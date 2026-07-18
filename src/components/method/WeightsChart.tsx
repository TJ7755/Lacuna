import { useState } from 'react';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

type Coefficient = {
  name: string;
  weight: number;
  reading: string;
};

/** The ten fitted coefficients, taken directly from the shipped model. */
const COEFFICIENTS: Coefficient[] = [
  { name: 'intercept', weight: 2.294, reading: 'The baseline bias term — where the model starts before any evidence is considered.' },
  { name: 'log(elapsed seconds)', weight: -0.76, reading: 'Longer since the last review pushes predicted recall down. Logged, so the first minutes matter far more than the later hours.' },
  { name: 'previous review succeeded', weight: 0.619, reading: 'Right last time nudges recall up.' },
  { name: 'previous review failed', weight: -0.619, reading: 'Wrong last time nudges recall down — the exact mirror of succeeding, and that symmetry is no accident (see below).' },
  { name: 'first time tested', weight: 0.112, reading: 'A brand-new card gets a small benefit of the doubt.' },
  { name: 'log(prior successes)', weight: 1.384, reading: 'A strong track record of getting a card right matters a lot. Capped at eight, so an enormous streak stops adding confidence.' },
  { name: 'log(prior failures)', weight: -2.68, reading: 'The single strongest driver in the model — a history of failing a card outweighs almost everything else.' },
  { name: 'FSRS state: learning', weight: 0.237, reading: 'Relative to a brand-new card, one in the learning state is slightly easier to recall.' },
  { name: 'FSRS state: review', weight: -0.62, reading: 'Relative to a brand-new card, one in long-term review is harder to recall at short lags — it has usually not been seen for a while.' },
  { name: 'FSRS state: relearning', weight: 0.383, reading: 'Relative to a brand-new card, one being relearnt was seen very recently, which helps.' },
];

const MAX_ABS = Math.max(...COEFFICIENTS.map((c) => Math.abs(c.weight)));

/**
 * The ten weights as a diverging bar chart. Bars grow from the centre line on
 * reveal, staggered; selecting a row explains what that weight means in
 * plain language.
 */
export function WeightsChart() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  const [selected, setSelected] = useState(6); // log(prior failures) — the headline weight

  return (
    <div ref={ref} className="mt-6 rounded-[10px] border border-line bg-surface p-5 shadow-paper">
      <ul className="space-y-1">
        {COEFFICIENTS.map((c, i) => {
          const negative = c.weight < 0;
          const widthPct = (Math.abs(c.weight) / MAX_ABS) * 50;
          const active = selected === i;
          return (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={active}
                className={
                  'grid w-full grid-cols-[minmax(0,11rem)_1fr_3.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ' +
                  (active ? 'bg-accent-soft/60' : 'hover:bg-ink/[0.03]')
                }
              >
                <span
                  className={
                    'truncate font-mono text-[11px] ' + (active ? 'text-accent-ink' : 'text-ink-soft')
                  }
                >
                  {c.name}
                </span>
                <span className="relative block h-3.5" aria-hidden>
                  <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                  <span
                    className={
                      'absolute inset-y-0 rounded-sm ' +
                      (negative ? 'right-1/2 bg-negative/70' : 'left-1/2 bg-accent/80')
                    }
                    style={{
                      width: visible ? `${widthPct}%` : 0,
                      transition: `width 700ms cubic-bezier(0.22, 1, 0.36, 1) ${120 + i * 60}ms`,
                    }}
                  />
                </span>
                <span
                  className={
                    'text-right font-mono text-[11px] tabular-nums ' +
                    (active ? 'text-ink' : 'text-ink-faint')
                  }
                >
                  {c.weight > 0 ? '+' : ''}
                  {c.weight.toFixed(3)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 min-h-14 border-t border-line pt-3 text-sm leading-relaxed text-ink-soft" aria-live="polite">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          {COEFFICIENTS[selected].name} ·{' '}
        </span>
        {COEFFICIENTS[selected].reading}
      </p>
    </div>
  );
}
