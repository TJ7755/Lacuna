import { cn } from '../../components/ui/cn';
import { GridIcon } from '../../components/ui/icons';
import { useCourseCardDetail } from '../../state/courseCardDetail';
import { useCourseCardMetric, type CourseCardMetric } from '../../state/courseCardMetric';
import { useDashboardSort, type DashboardSort } from '../../state/dashboardSort';
import { useForecastRange, type ForecastRange } from '../../state/forecastRange';
import { SettingsSectionHeading, SettingsSubsectionHeading } from './SettingsSectionHeading';
import { SegmentedPills, PillSwitch, SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';

const SORT_OPTIONS: { value: DashboardSort; label: string }[] = [
  { value: 'recent', label: 'Recently studied' },
  { value: 'ready', label: 'Ready for review' },
  { value: 'mastery', label: 'Lowest exam readiness' },
  { value: 'exam', label: 'Soonest exam' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'created', label: 'Created recently' },
];

const RANGE_OPTIONS: { value: ForecastRange; label: string }[] = [
  { value: 'fortnight', label: '2 weeks' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: '3 months' },
];

export function DashboardSection() {
  const [dashboardSort, setDashboardSort] = useDashboardSort();
  const [cardDetail, setCardDetail] = useCourseCardDetail();
  const [courseCardMetric, setCourseCardMetric] = useCourseCardMetric();
  const [forecastRange, setForecastRange] = useForecastRange();

  return (
    <SettingsCard id="settings-dashboard">
      <div className={cn('mb-5', SETTINGS_HEADING_ROW_CLASS)}>
        <GridIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Dashboard
        </SettingsSectionHeading>
      </div>
      <SettingsSubsectionHeading className="mb-3 text-sm font-medium text-ink">
        Sort courses
      </SettingsSubsectionHeading>
      <SegmentedPills
        label="Sort courses"
        semantics="pressed"
        value={dashboardSort}
        options={SORT_OPTIONS}
        onChange={setDashboardSort}
      />

      <div className="mt-5 border-t border-line pt-5">
        <SettingsSubsectionHeading className="mb-3 text-sm font-medium text-ink">
          Course progress metric
        </SettingsSubsectionHeading>
        <SegmentedPills
          label="Course progress metric"
          semantics="pressed"
          value={courseCardMetric}
          options={
            [
              { value: 'curriculum', label: 'Course progress' },
              { value: 'coverage', label: 'Card coverage' },
              { value: 'today', label: "Today's workload" },
            ] satisfies { value: CourseCardMetric; label: string }[]
          }
          onChange={setCourseCardMetric}
        />
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <SettingsSubsectionHeading className="mb-3 text-sm font-medium text-ink">
          Forecast range
        </SettingsSubsectionHeading>
        <SegmentedPills
          label="Forecast range"
          semantics="pressed"
          value={forecastRange}
          options={RANGE_OPTIONS}
          onChange={setForecastRange}
        />
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <SettingsSubsectionHeading className="mb-3 text-sm font-medium text-ink">
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
