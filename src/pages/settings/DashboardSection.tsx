import { cn } from '../../components/ui/cn';
import { GridIcon } from '../../components/ui/icons';
import { useCourseCardDetail } from '../../state/courseCardDetail';
import { useCourseCardMetric, type CourseCardMetric } from '../../state/courseCardMetric';
import { useDashboardSort, type DashboardSort } from '../../state/dashboardSort';
import { SettingsSectionHeading, SettingsSubsectionHeading } from './SettingsSectionHeading';
import {
  choiceChipClass,
  PillSwitch,
  SETTINGS_HEADING_ROW_CLASS,
  SettingsCard,
} from './SettingsUi';

const SORT_OPTIONS: { key: DashboardSort; label: string }[] = [
  { key: 'recent', label: 'Recently studied' },
  { key: 'ready', label: 'Ready for review' },
  { key: 'mastery', label: 'Lowest mastery' },
  { key: 'exam', label: 'Soonest exam' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'created', label: 'Created recently' },
];

export function DashboardSection() {
  const [dashboardSort, setDashboardSort] = useDashboardSort();
  const [cardDetail, setCardDetail] = useCourseCardDetail();
  const [courseCardMetric, setCourseCardMetric] = useCourseCardMetric();

  return (
    <SettingsCard id="settings-dashboard">
      <div className={cn('mb-5', SETTINGS_HEADING_ROW_CLASS)}>
        <GridIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Dashboard
        </SettingsSectionHeading>
      </div>
      <div className="flex flex-wrap gap-2">
        {SORT_OPTIONS.map((option) => {
          const active = dashboardSort === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setDashboardSort(option.key)}
              aria-pressed={active}
              className={choiceChipClass(active)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 pt-0">
        <SettingsSubsectionHeading className="mb-4 text-sm font-medium text-ink">
          Course progress metric
        </SettingsSubsectionHeading>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: 'curriculum', label: 'Course progress' },
              { key: 'coverage', label: 'Card coverage' },
              { key: 'today', label: "Today's workload" },
            ] as { key: CourseCardMetric; label: string }[]
          ).map((option) => {
            const active = courseCardMetric === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setCourseCardMetric(option.key)}
                aria-pressed={active}
                className={choiceChipClass(active)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 pt-0">
        <SettingsSubsectionHeading className="mb-4 text-sm font-medium text-ink">
          Card hover detail
        </SettingsSubsectionHeading>
        <div className="flex flex-col gap-3">
          <PillSwitch
            id="card-detail-next-due"
            label="Next review time"
            checked={cardDetail.nextDue}
            onChange={(checked) => setCardDetail({ nextDue: checked })}
          />
          <PillSwitch
            id="card-detail-breakdown"
            label="New, learnt and due breakdown"
            checked={cardDetail.breakdown}
            onChange={(checked) => setCardDetail({ breakdown: checked })}
          />
          <PillSwitch
            id="card-detail-activity"
            label="Recent review activity"
            checked={cardDetail.activity}
            onChange={(checked) => setCardDetail({ activity: checked })}
          />
        </div>
      </div>
    </SettingsCard>
  );
}
