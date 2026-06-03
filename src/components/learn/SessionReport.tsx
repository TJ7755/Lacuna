import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'motion/react';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { useChartColours } from '../analytics/useChartColours';
import type { SessionSummary } from './types';

const GRADE_LABELS: Record<number, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

export function SessionReport({
  summary,
  onReturn,
  onContinue,
}: {
  summary: SessionSummary;
  onReturn: () => void;
  /** Offered only when the user can keep studying (goal not yet reached). */
  onContinue?: () => void;
}) {
  const c = useChartColours();
  const { events } = summary;

  const total = events.length;
  const correct = events.filter((e) => e.correct).length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const distractions = events.filter((e) => e.distracted).length;

  const meanResponse = useMemo(() => {
    const correctEvents = events.filter((e) => e.correct);
    if (correctEvents.length === 0) return 0;
    return (
      correctEvents.reduce((s, e) => s + e.responseTimeSec, 0) / correctEvents.length
    );
  }, [events]);

  const gradeData = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const e of events) counts[e.grade]++;
    return [1, 2, 3, 4].map((g) => ({
      grade: GRADE_LABELS[g],
      count: counts[g],
      g,
    }));
  }, [events]);

  const gradeColour = (g: number) =>
    g === 1 ? c.inkFaint : g === 2 ? c.inkSoft : g === 3 ? c.accent : c.positive;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="mb-1 text-sm uppercase tracking-[0.18em] text-ink-faint">
          {summary.reachedGoal ? 'Goal reached' : 'Session complete'}
        </p>
        <h1 className="mb-8 font-display text-4xl tracking-tight md:text-5xl">
          {summary.reachedGoal ? 'You’ve reached your goal' : 'Nice work'}
        </h1>

        {/* Progress before/after */}
        <div className="mb-6 rounded-2xl border border-line bg-surface p-6">
          <div className="mb-2 flex items-center justify-between text-sm text-ink-soft">
            <span>{summary.objectiveLabel}</span>
            <span className="tabular text-ink">
              {Math.round(summary.masteryBefore * 100)}% →{' '}
              <span className="font-medium text-accent">
                {Math.round(summary.masteryAfter * 100)}%
              </span>
            </span>
          </div>
          <ProgressBar value={summary.masteryAfter} />
        </div>

        {/* Stat tiles */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Cards reviewed" value={String(total)} />
          <Stat label="Accuracy" value={`${accuracy}%`} />
          <Stat label="Mean time" value={`${meanResponse.toFixed(1)}s`} />
          <Stat label="Focus" value={`${Math.round(summary.focusFraction * 100)}%`} />
        </div>

        {/* Grade distribution */}
        <div className="mb-6 rounded-2xl border border-line bg-surface p-6">
          <h3 className="mb-4 font-display text-xl">How you rated</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <XAxis
                  dataKey="grade"
                  stroke={c.inkFaint}
                  tick={{ fill: c.inkFaint, fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  stroke={c.inkFaint}
                  tick={{ fill: c.inkFaint, fontSize: 11 }}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ fill: c.line, opacity: 0.4 }}
                  contentStyle={{
                    background: c.surface,
                    border: `1px solid ${c.line}`,
                    borderRadius: 10,
                    color: c.ink,
                    fontSize: 13,
                  }}
                  formatter={(v: number) => [v, 'Cards']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {gradeData.map((d) => (
                    <Cell key={d.g} fill={gradeColour(d.g)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {distractions > 0 && (
          <p className="mb-6 text-sm text-ink-soft">
            You left the page during{' '}
            <strong className="text-ink">{distractions}</strong> of {total} cards. This
            did not affect your grades, but staying focused keeps the timing accurate.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {onContinue && (
            <Button variant="secondary" size="lg" onClick={onContinue}>
              Keep studying
            </Button>
          )}
          <Button variant="primary" size="lg" onClick={onReturn}>
            Back to deck
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="font-display text-3xl tabular tracking-tight">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}
