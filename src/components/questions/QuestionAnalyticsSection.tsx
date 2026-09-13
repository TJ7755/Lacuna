import type { QuestionAnalytics, QuestionPerformanceMetric } from '../../questions/analytics';

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function QuestionAnalyticsSection({ analytics }: { analytics: QuestionAnalytics }) {
  const criteria = [...analytics.criteria].sort(
    (left, right) =>
      left.markRate - right.markRate ||
      right.opportunityCount - left.opportunityCount ||
      left.id.localeCompare(right.id),
  );
  const performanceMetrics = [
    analytics.fixed.firstPresentation,
    analytics.fixed.repeat,
    analytics.generated.novel,
    analytics.generated.repeated,
  ];
  const marksEarned = performanceMetrics.reduce((total, metric) => total + metric.marksEarned, 0);
  const marksAvailable = performanceMetrics.reduce(
    (total, metric) => total + metric.marksAvailable,
    0,
  );
  const excludedAttemptCount = Object.values(analytics.excluded).reduce(
    (total, count) => total + count,
    0,
  );
  const hasRetainedEvidence =
    performanceMetrics.some((metric) => metric.attemptCount > 0) ||
    analytics.generated.presentationCount > 0 ||
    excludedAttemptCount > 0;

  return (
    <section aria-labelledby="question-analytics-heading" className="mb-10">
      <h2 id="question-analytics-heading" className="mb-4 font-display text-2xl text-ink">
        Questions
      </h2>

      {analytics.inventory.total === 0 && !hasRetainedEvidence ? (
        <div className="border-y border-line py-8 text-sm text-ink-soft">
          No question attempts yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex flex-col border-b border-line sm:flex-row sm:items-center">
            <div className="flex items-center justify-between gap-6 bg-accent-soft px-5 py-5 sm:flex-1 sm:px-6">
              <p className="text-sm text-ink-soft">Novel generated accuracy</p>
              <p className="font-display text-4xl tabular-nums tracking-tight text-ink">
                {percent(analytics.generated.novel.accuracy)}
              </p>
            </div>
            <div className="grid grid-cols-3 border-t border-line sm:flex-1 sm:border-t-0">
              <InventoryStat label="Due" value={analytics.inventory.due} />
              <InventoryStat label="Unseen" value={analytics.inventory.unseen} />
              <InventoryStat label="Suspended" value={analytics.inventory.suspended} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table
              aria-label="Question performance"
              className="w-full min-w-[28rem] text-left text-sm"
            >
              <thead className="text-xs text-ink-soft">
                <tr className="border-b border-line">
                  <th scope="col" className="px-5 py-3 font-medium">
                    Type
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Accuracy
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Marks
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    Attempts
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <MetricRow
                  label="Fixed · first presentation"
                  metric={analytics.fixed.firstPresentation}
                />
                <MetricRow label="Fixed · repeats" metric={analytics.fixed.repeat} />
                <MetricRow label="Generated · novel variants" metric={analytics.generated.novel} />
                <MetricRow
                  label="Generated · repeated variants"
                  metric={analytics.generated.repeated}
                />
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-6 border-t border-line p-5 xl:grid-cols-4 md:p-6">
            <div>
              <p className="text-xs text-ink-soft">Fixed coverage</p>
              <p className="mt-2 font-display text-2xl text-ink">
                {percent(analytics.fixed.exposureCoverage)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-soft">Generated repeat rate</p>
              <p className="mt-2 font-display text-2xl text-ink">
                {percent(analytics.generated.repeatRate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-soft">Recorded marks</p>
              <p className="mt-2 font-display text-2xl text-ink">
                {marksEarned} / {marksAvailable}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-soft">Checker disputes</p>
              <p className="mt-2 font-display text-2xl text-ink">{analytics.checkerDisputeCount}</p>
            </div>
          </div>

          <details className="border-t border-line px-5 py-4 md:px-6">
            <summary className="cursor-pointer text-sm text-ink-soft marker:text-ink-faint">
              Attempt details
            </summary>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink-soft">Fixed questions seen</dt>
                <dd className="mt-1 tabular-nums">
                  {analytics.fixed.presentedDefinitionCount} / {analytics.fixed.definitionCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Repeated presentations</dt>
                <dd className="mt-1 tabular-nums">
                  {analytics.generated.repeatedPresentationCount} /{' '}
                  {analytics.generated.presentationCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Unique variants seen</dt>
                <dd className="mt-1 tabular-nums">{analytics.generated.uniqueVariantCount}</dd>
              </div>
            </dl>
            {excludedAttemptCount > 0 && (
              <>
                <p className="mt-5 text-sm text-ink-soft">
                  Excluded attempts · {excludedAttemptCount}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <InventoryStat label="Shown" value={analytics.excluded.shown} />
                  <InventoryStat label="Abandoned" value={analytics.excluded.abandoned} />
                  <InventoryStat label="Undone" value={analytics.excluded.undone} />
                  <InventoryStat
                    label="Checker withheld"
                    value={analytics.excluded.checkerWithheld}
                  />
                  <InventoryStat label="Unscored" value={analytics.excluded.unscored} />
                </div>
              </>
            )}
          </details>

          {criteria.length > 0 && (
            <div className="border-t border-line p-5 md:p-6">
              <p className="mb-3 text-xs text-ink-soft">Criterion performance</p>
              <div className="grid gap-2 md:grid-cols-3">
                {criteria.map((criterion) => (
                  <div key={criterion.id} className="border-t border-line py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{criterion.label}</p>
                      <span className="shrink-0 font-mono text-xs text-ink-faint">
                        v{criterion.contentVersion} · line {criterion.lineIndex + 1}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-ink-soft">
                      {percent(criterion.markRate)} of marks across {criterion.opportunityCount}{' '}
                      {criterion.opportunityCount === 1 ? 'opportunity' : 'opportunities'}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">
                      {criterion.questionId}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function InventoryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-4 text-center">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums text-ink">{value}</p>
    </div>
  );
}

function MetricRow({ label, metric }: { label: string; metric: QuestionPerformanceMetric }) {
  return (
    <tr>
      <th scope="row" className="px-5 py-4 font-normal text-ink-soft">
        {label}
      </th>
      <td className="px-3 py-4 text-right tabular-nums text-ink">{percent(metric.accuracy)}</td>
      <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums text-ink">
        {metric.marksAvailable > 0 ? `${metric.marksEarned} / ${metric.marksAvailable}` : '—'}
      </td>
      <td className="px-5 py-4 text-right tabular-nums text-ink">{metric.attemptCount}</td>
    </tr>
  );
}
