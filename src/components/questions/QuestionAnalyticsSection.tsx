import type { QuestionAnalytics, QuestionPerformanceMetric } from '../../questions/analytics';

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function evidenceLabel(metric: QuestionPerformanceMetric): string {
  if (metric.attemptCount === 0) return 'No scored attempts';
  return `${metric.attemptCount} scored ${metric.attemptCount === 1 ? 'attempt' : 'attempts'}`;
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
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-faint">Separate evidence</p>
          <h2 id="question-analytics-heading" className="mt-1 font-display text-2xl text-ink">
            Questions
          </h2>
        </div>
        <p className="max-w-md text-right text-xs leading-5 text-ink-faint">
          Question evidence is not included in Card readiness or predicted exam-day score.
        </p>
      </div>

      {analytics.inventory.total === 0 && !hasRetainedEvidence ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-ink-soft">
          Create and practise Questions to see application evidence here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="grid border-b border-line md:grid-cols-[1.35fr_1fr]">
            <div className="relative overflow-hidden bg-accent-soft p-6 md:p-7">
              <div className="absolute inset-0 bg-dot-grid opacity-25" aria-hidden="true" />
              <div className="relative">
                <p className="text-xs uppercase tracking-[0.16em] text-accent">
                  Novel generated accuracy
                </p>
                <p className="mt-3 font-display text-5xl tracking-tight text-ink">
                  {percent(analytics.generated.novel.accuracy)}
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  {evidenceLabel(analytics.generated.novel)} ·{' '}
                  {analytics.generated.uniqueVariantCount}{' '}
                  {analytics.generated.uniqueVariantCount === 1 ? 'variant seen' : 'variants seen'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-line md:grid-cols-1 md:divide-x-0 md:divide-y">
              <InventoryStat label="Due" value={analytics.inventory.due} />
              <InventoryStat label="Unseen" value={analytics.inventory.unseen} />
              <InventoryStat label="Suspended" value={analytics.inventory.suspended} />
            </div>
          </div>

          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
            <MetricCell
              label="Fixed · first presentation"
              metric={analytics.fixed.firstPresentation}
            />
            <MetricCell label="Fixed · repeats" metric={analytics.fixed.repeat} />
            <MetricCell label="Generated · novel variants" metric={analytics.generated.novel} />
            <MetricCell
              label="Generated · repeated variants"
              metric={analytics.generated.repeated}
            />
          </div>

          <div className="grid gap-6 border-t border-line p-5 sm:grid-cols-2 xl:grid-cols-4 md:p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.13em] text-ink-faint">
                Fixed exposure coverage
              </p>
              <p className="mt-2 font-display text-2xl text-ink">
                {percent(analytics.fixed.exposureCoverage)}
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                {analytics.fixed.presentedDefinitionCount} of {analytics.fixed.definitionCount}{' '}
                fixed Questions presented
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.13em] text-ink-faint">
                Generated repeat rate
              </p>
              <p className="mt-2 font-display text-2xl text-ink">
                {percent(analytics.generated.repeatRate)}
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                {analytics.generated.repeatedPresentationCount} of{' '}
                {analytics.generated.presentationCount} presentations
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.13em] text-ink-faint">Recorded marks</p>
              <p className="mt-2 font-display text-2xl text-ink">
                {marksEarned} / {marksAvailable}
              </p>
              <p className="mt-1 text-xs text-ink-faint">Across active scored submissions</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.13em] text-ink-faint">Checker disputes</p>
              <p className="mt-2 font-display text-2xl text-ink">{analytics.checkerDisputeCount}</p>
              <p className="mt-1 text-xs text-ink-faint">
                Disputed and unchecked results are withheld from accuracy.
              </p>
            </div>
          </div>

          <div className="border-t border-line p-5 md:p-6">
            <p className="mb-3 text-xs uppercase tracking-[0.13em] text-ink-faint">
              Excluded evidence
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <InventoryStat label="Shown" value={analytics.excluded.shown} />
              <InventoryStat label="Abandoned" value={analytics.excluded.abandoned} />
              <InventoryStat label="Undone" value={analytics.excluded.undone} />
              <InventoryStat label="Checker withheld" value={analytics.excluded.checkerWithheld} />
              <InventoryStat label="Unscored" value={analytics.excluded.unscored} />
            </div>
          </div>

          {criteria.length > 0 && (
            <div className="border-t border-line p-5 md:p-6">
              <p className="mb-3 text-xs uppercase tracking-[0.13em] text-ink-faint">
                Criterion performance
              </p>
              <div className="grid gap-2 md:grid-cols-3">
                {criteria.map((criterion) => (
                  <div key={criterion.id} className="rounded-xl bg-surface-raised px-4 py-3">
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
    <div className="bg-surface px-3 py-4 text-center md:flex md:items-baseline md:justify-between md:px-5">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums text-ink md:mt-0">{value}</p>
    </div>
  );
}

function MetricCell({ label, metric }: { label: string; metric: QuestionPerformanceMetric }) {
  return (
    <div className="bg-surface p-5">
      <p className="text-xs uppercase tracking-[0.13em] text-ink-faint">{label}</p>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="font-display text-3xl text-ink">{percent(metric.accuracy)}</p>
        <p className="font-mono text-xs text-ink-faint">{percent(metric.markRate)} marks</p>
      </div>
      <p className="mt-1 text-xs text-ink-faint">{evidenceLabel(metric)}</p>
      <p className="mt-1 font-mono text-xs text-ink-faint">
        {metric.marksEarned} / {metric.marksAvailable} marks
      </p>
    </div>
  );
}
