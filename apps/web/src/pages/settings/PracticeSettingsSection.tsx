import { InlineSettingsDisclosure } from './InlineSettingsDisclosure';
import { Input, fieldLabelClassName } from '../../components/ui/Field';
import { Toggle } from '../../components/ui/Toggle';
import { useAdvancedDetails } from '../../state/advancedDetails';

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
  const [showAdvancedDetails] = useAdvancedDetails();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-ink">Auto-practice</span>
        <Toggle checked={autoPractice} onChange={onAutoPracticeChange} ariaLabel="Auto-practice" />
      </div>

      {showAdvancedDetails && (
        <InlineSettingsDisclosure
          className="group ml-3 sm:ml-4"
          headerClassName="flex min-h-11 items-center justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          header={<span className="text-sm font-semibold text-ink">Advanced practice timing</span>}
        >
          <div className="mt-4 flex flex-col gap-4 rounded-2xl bg-ink/[0.03] p-4">
            <label className={fieldLabelClassName}>
              Backlog before revision period (min)
              <Input
                type="number"
                aria-label="Backlog before revision period (min)"
                min={0}
                inputMode="numeric"
                value={practiceThresholdMinutesFar}
                onChange={(e) => onPracticeThresholdMinutesFarChange(e.target.value)}
                onBlur={onPracticeThresholdMinutesFarBlur}
              />
            </label>

            <label className={fieldLabelClassName}>
              Backlog during revision period (min)
              <Input
                type="number"
                aria-label="Backlog during revision period (min)"
                min={0}
                inputMode="numeric"
                value={practiceThresholdMinutesNear}
                onChange={(e) => onPracticeThresholdMinutesNearChange(e.target.value)}
                onBlur={onPracticeThresholdMinutesNearBlur}
              />
            </label>

            <label className={fieldLabelClassName}>
              Revision period (days before exam)
              <Input
                type="number"
                aria-label="Revision period (days before exam)"
                min={0}
                inputMode="numeric"
                value={practiceUrgentWindowDays}
                onChange={(e) => onPracticeUrgentWindowDaysChange(e.target.value)}
                onBlur={onPracticeUrgentWindowDaysBlur}
              />
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
            </label>
          </div>
        </InlineSettingsDisclosure>
      )}
    </div>
  );
}
