import { InlineSettingsDisclosure } from './InlineSettingsDisclosure';
import { Input, fieldLabelClassName, fieldHintClassName } from '../../components/ui/Field';
import { Toggle } from '../../components/ui/Toggle';

export interface PracticeSettingsSectionProps {
  autoPractice: boolean;
  onAutoPracticeChange: (value: boolean) => void;
  practiceThresholdMinutesFar: string;
  onPracticeThresholdMinutesFarChange: (value: string) => void;
  onPracticeThresholdMinutesFarBlur: () => void;
  practiceThresholdMinutesNear: string;
  onPracticeThresholdMinutesNearChange: (value: string) => void;
  onPracticeThresholdMinutesNearBlur: () => void;
  practiceUrgentWindowDays: string;
  onPracticeUrgentWindowDaysChange: (value: string) => void;
  onPracticeUrgentWindowDaysBlur: () => void;
  practiceMaxGap: string;
  onPracticeMaxGapChange: (value: string) => void;
  onPracticeMaxGapBlur: () => void;
}

/**
 * Course-only auto-practice settings: whether the system inserts practice nodes
 * between lessons, the minutes-to-clear thresholds that trigger one (far vs near
 * the exam), the days-until-exam cutoff between those two thresholds, and the
 * backstop maximum lesson gap. The decision stays visible while the numeric policy sits behind
 * Advanced practice timing. Pure controlled component — all state lives with
 * the caller, which parses these strings and falls back to the current course
 * value on blur (see the `on*Blur` callbacks).
 */
export function PracticeSettingsSection({
  autoPractice,
  onAutoPracticeChange,
  practiceThresholdMinutesFar,
  onPracticeThresholdMinutesFarChange,
  onPracticeThresholdMinutesFarBlur,
  practiceThresholdMinutesNear,
  onPracticeThresholdMinutesNearChange,
  onPracticeThresholdMinutesNearBlur,
  practiceUrgentWindowDays,
  onPracticeUrgentWindowDaysChange,
  onPracticeUrgentWindowDaysBlur,
  practiceMaxGap,
  onPracticeMaxGapChange,
  onPracticeMaxGapBlur,
}: PracticeSettingsSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="block text-sm font-semibold text-ink">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-ink">Auto-practice</span>
          <Toggle checked={autoPractice} onChange={onAutoPracticeChange} ariaLabel="Auto-practice" />
        </div>
        <span className={fieldHintClassName}>
          Automatically inserts practice nodes between lessons when the predicted time to clear your
          backlog crosses a threshold.
        </span>
      </div>

      <InlineSettingsDisclosure
        className="group ml-3 sm:ml-4"
        headerClassName="flex min-h-11 items-center justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        header={
          <>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">Advanced practice timing</span>
              <span className="mt-1 block text-xs leading-5 text-ink-faint">
                Lacuna places practice from workload and exam proximity. Open this to tune the
                thresholds and maximum gap.
              </span>
            </span>
          </>
        }
      >
        <div className="mt-4 flex flex-col gap-4 rounded-2xl bg-ink/[0.03] p-4">
          <label className={fieldLabelClassName}>
            Threshold (exam not near)
            <Input
              type="number"
              aria-label="Practice threshold when the exam is not near, in minutes"
              min={0}
              inputMode="numeric"
              value={practiceThresholdMinutesFar}
              onChange={(e) => onPracticeThresholdMinutesFarChange(e.target.value)}
              onBlur={onPracticeThresholdMinutesFarBlur}
            />
            <span className={fieldHintClassName}>
              Minutes-to-clear at which a practice node is triggered while the exam is not near.
            </span>
          </label>

          <label className={fieldLabelClassName}>
            Threshold (exam near)
            <Input
              type="number"
              aria-label="Practice threshold when the exam is near, in minutes"
              min={0}
              inputMode="numeric"
              value={practiceThresholdMinutesNear}
              onChange={(e) => onPracticeThresholdMinutesNearChange(e.target.value)}
              onBlur={onPracticeThresholdMinutesNearBlur}
            />
            <span className={fieldHintClassName}>
              Minutes-to-clear at which a practice node is triggered once the exam is near (see the
              urgent window below). Typically lower than the far threshold.
            </span>
          </label>

          <label className={fieldLabelClassName}>
            Urgent window
            <Input
              type="number"
              aria-label="Practice urgent window, in days"
              min={0}
              inputMode="numeric"
              value={practiceUrgentWindowDays}
              onChange={(e) => onPracticeUrgentWindowDaysChange(e.target.value)}
              onBlur={onPracticeUrgentWindowDaysBlur}
            />
            <span className={fieldHintClassName}>
              Days until the exam at or below which the &quot;exam near&quot; threshold applies.
            </span>
          </label>

          <label className={fieldLabelClassName}>
            Maximum lesson gap
            <Input
              type="number"
              aria-label="Maximum lesson gap for automatic practice"
              min={1}
              inputMode="numeric"
              value={practiceMaxGap}
              onChange={(e) => onPracticeMaxGapChange(e.target.value)}
              onBlur={onPracticeMaxGapBlur}
            />
            <span className={fieldHintClassName}>
              Backstop: forces a practice node after this many lessons without one, even if neither
              threshold above has been crossed.
            </span>
          </label>
        </div>
      </InlineSettingsDisclosure>
    </div>
  );
}
