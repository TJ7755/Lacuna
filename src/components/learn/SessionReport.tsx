import { useMemo } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { useChartColours } from '../analytics/useChartColours';
import type { SessionSummary } from './types';
import './SessionReport.css';

const GRADE_LABELS: Record<number, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

export function SessionReport({
  summary,
  onReturn,
  onContinue,
}: {
  summary: SessionSummary;
  onReturn: () => void;
  /** Repeats Simple Learn or continues a session when the caller allows it. */
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
    return correctEvents.reduce((s, e) => s + e.responseTimeSec, 0) / correctEvents.length;
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

  const delta = Math.round((summary.masteryAfter - summary.masteryBefore) * 100);

  return (
    <main className="session-report" aria-label="Session report">
      <h1>
        {summary.reachedGoal
          ? 'Goal reached.'
          : summary.timeLimitReached
            ? 'Time’s up'
            : summary.limitReached
              ? 'You’ve hit your daily limit'
              : 'Nice work'}
      </h1>
      {summary.limitReached && (
        <p className="session-report-notice">You can continue studying or come back tomorrow.</p>
      )}
      {summary.timeLimitReached && (
        <p className="session-report-notice">You can continue studying or take a break.</p>
      )}

      <dl className="session-report-facts">
        <div>
          <dt>{total === 1 ? 'Card reviewed' : 'Cards reviewed'}</dt>
          <dd>{total}</dd>
        </div>
        <div>
          <dt>Accuracy</dt>
          <dd>
            {accuracy}
            <span>%</span>
          </dd>
        </div>
      </dl>

      <div className="session-report-progress">
        <div className="session-report-progress-label">
          <span>{summary.objectiveLabel}</span>
          <span className="tabular-nums">
            {Math.round(summary.masteryBefore * 100)}% →{' '}
            <strong>{Math.round(summary.masteryAfter * 100)}%</strong>
          </span>
        </div>
        <ProgressBar
          value={summary.masteryAfter}
          height={3}
          label={summary.objectiveLabel}
          variant={summary.reachedGoal ? 'positive' : 'accent'}
        />
      </div>

      <details className="session-report-details">
        <summary>
          Session details <span aria-hidden="true">+</span>
        </summary>
        <div className="session-report-detail-content">
          <dl>
            <div>
              <dt>Mean time</dt>
              <dd>{meanResponse.toFixed(1)}s</dd>
            </div>
            <div>
              <dt>Focus</dt>
              <dd>{Math.round(summary.focusFraction * 100)}%</dd>
            </div>
            <div>
              <dt>Progress this session</dt>
              <dd>
                {delta >= 0 ? '+' : ''}
                {delta} percentage points
              </dd>
            </div>
          </dl>
          {/* Keep the first-pass report focused on correct and remaining cards. */}
          {!summary.simpleMode && (
            <div className="mt-6">
              <h2 className="mb-4 font-display text-xl">How you rated</h2>
              <div className="h-48">
                <ResponsiveContainer width="100%" height={192}>
                  <BarChart data={gradeData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                      formatter={(v) => [v, 'Cards']}
                    />
                    <Bar dataKey="count" isAnimationActive={false} radius={[6, 6, 0, 0]}>
                      {gradeData.map((d) => (
                        <Cell key={d.g} fill={gradeColour(d.g)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {distractions > 0 && (
            <p className="session-report-distractions">
              You left the page during {distractions} of {total} cards. Your grades were unaffected;
              the timing may be less representative.
            </p>
          )}
        </div>
      </details>

      <div className="session-report-actions">
        <Button variant="primary" size="lg" onClick={onReturn} className="session-report-done">
          Done
          <svg
            className="session-report-arrow"
            width="22"
            height="16"
            viewBox="0 0 22 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M1 8h19M14 2l6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
        {onContinue && (
          <Button variant="ghost" size="lg" onClick={onContinue}>
            {summary.limitReached || summary.timeLimitReached ? 'Continue anyway' : 'Keep studying'}
          </Button>
        )}
      </div>
    </main>
  );
}
