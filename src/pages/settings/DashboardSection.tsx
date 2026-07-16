import { m as motion } from 'motion/react';
import { cn } from '../../components/ui/cn';
import { GridIcon } from '../../components/ui/icons';
import { Toggle } from '../../components/ui/Toggle';
import { useCourseCardDetail } from '../../state/courseCardDetail';
import { useDashboardSort, type DashboardSort } from '../../state/dashboardSort';

const SORT_OPTIONS: { key: DashboardSort; label: string }[] = [
  { key: 'recent', label: 'Recently studied' },
  { key: 'ready', label: 'Ready for review' },
  { key: 'mastery', label: 'Lowest mastery' },
  { key: 'exam', label: 'Soonest exam' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'created', label: 'Created recently' },
];

export function DashboardSection({ motionMultiplier }: { motionMultiplier: number }) {
  const [dashboardSort, setDashboardSort] = useDashboardSort();
  const [cardDetail, setCardDetail] = useCourseCardDetail();

  return (
    <motion.section
      id="settings-dashboard"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.2 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <GridIcon width={18} height={18} />
        <h2 className="font-display text-xl">Dashboard</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        Choose how courses are ordered on the dashboard. The top three active courses are shown.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SORT_OPTIONS.map((option) => {
          const active = dashboardSort === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setDashboardSort(option.key)}
              aria-pressed={active}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                active
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="mb-1 text-sm font-medium text-ink">Card hover detail</h3>
        <p className="mb-4 text-sm text-ink-soft">
          Choose what a course card reveals when you hover over it.
        </p>
        <div className="flex flex-col gap-3">
          <Toggle id="card-detail-next-due" label="Next review time" checked={cardDetail.nextDue} onChange={(checked) => setCardDetail({ nextDue: checked })} />
          <Toggle id="card-detail-breakdown" label="New, learnt and due breakdown" checked={cardDetail.breakdown} onChange={(checked) => setCardDetail({ breakdown: checked })} />
          <Toggle id="card-detail-activity" label="Recent review activity" checked={cardDetail.activity} onChange={(checked) => setCardDetail({ activity: checked })} />
        </div>
      </div>
    </motion.section>
  );
}
