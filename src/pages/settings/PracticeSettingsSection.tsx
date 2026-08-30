import { Toggle } from '../../components/ui/Toggle';
import { ChevronDownIcon } from '../../components/ui/icons';

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
    <div className="flex flex-col gap-4">
      <div className="block text-sm text-ink-soft">
        <Toggle checked={autoPractice} onChange={onAutoPracticeChange} label="Auto-practice" />
        <span className="mt-1 block text-xs text-ink-faint">
          Automatically inserts practice nodes between lessons when the predicted time to clear your
          backlog crosses a threshold.
        </span>
      </div>

      <details className="group border-t border-line pt-4">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Advanced practice timing</span>
            <span className="mt-1 block text-xs leading-5 text-ink-faint">
              Lacuna places practice from workload and exam proximity. Open this to tune the
              thresholds and maximum gap.
            </span>
          </span>
          <ChevronDownIcon
            width={18}
            height={18}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-ink-faint transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-line bg-surface-raised/50 p-4">
          <label className="block text-sm text-ink-soft">
            Threshold (exam not near)
            <input
              type="number"
              aria-label="Practice threshold when the exam is not near, in minutes"
              min={0}
              inputMode="numeric"
              value={practiceThresholdMinutesFar}
              onChange={(e) => onPracticeThresholdMinutesFarChange(e.target.value)}
              onBlur={onPracticeThresholdMinutesFarBlur}
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-ink-faint">
              Minutes-to-clear at which a practice node is triggered while the exam is not near.
            </span>
          </label>

          <label className="block text-sm text-ink-soft">
            Threshold (exam near)
            <input
              type="number"
              aria-label="Practice threshold when the exam is near, in minutes"
              min={0}
              inputMode="numeric"
              value={practiceThresholdMinutesNear}
              onChange={(e) => onPracticeThresholdMinutesNearChange(e.target.value)}
              onBlur={onPracticeThresholdMinutesNearBlur}
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-ink-faint">
              Minutes-to-clear at which a practice node is triggered once the exam is near (see the
              urgent window below). Typically lower than the far threshold.
            </span>
          </label>

          <label className="block text-sm text-ink-soft">
            Urgent window
            <input
              type="number"
              aria-label="Practice urgent window, in days"
              min={0}
              inputMode="numeric"
              value={practiceUrgentWindowDays}
              onChange={(e) => onPracticeUrgentWindowDaysChange(e.target.value)}
              onBlur={onPracticeUrgentWindowDaysBlur}
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-ink-faint">
              Days until the exam at or below which the &quot;exam near&quot; threshold applies.
            </span>
          </label>

          <label className="block text-sm text-ink-soft">
            Maximum lesson gap
            <input
              type="number"
              aria-label="Maximum lesson gap for automatic practice"
              min={1}
              inputMode="numeric"
              value={practiceMaxGap}
              onChange={(e) => onPracticeMaxGapChange(e.target.value)}
              onBlur={onPracticeMaxGapBlur}
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-ink-faint">
              Backstop: forces a practice node after this many lessons without one, even if neither
              threshold above has been crossed.
            </span>
          </label>
        </div>
      </details>
    </div>
  );
}
