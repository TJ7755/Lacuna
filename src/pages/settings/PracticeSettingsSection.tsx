import { Toggle } from '../../components/ui/Toggle';

export interface PracticeSettingsSectionProps {
  autoPractice: boolean;
  onAutoPracticeChange: (value: boolean) => void;
  practiceThresholdMinutesFar: string;
  onPracticeThresholdMinutesFarChange: (value: string) => void;
  practiceThresholdMinutesNear: string;
  onPracticeThresholdMinutesNearChange: (value: string) => void;
  practiceUrgentWindowDays: string;
  onPracticeUrgentWindowDaysChange: (value: string) => void;
  practiceMaxGap: string;
  onPracticeMaxGapChange: (value: string) => void;
}

/**
 * Course-only auto-practice settings: whether the system inserts practice nodes
 * between lessons, the minutes-to-clear thresholds that trigger one (far vs near
 * the exam), the days-until-exam cutoff between those two thresholds, and the
 * backstop maximum lesson gap. Pure controlled component — all state lives with
 * the caller, which parses these strings and falls back to the current course
 * value on blur/save.
 */
export function PracticeSettingsSection({
  autoPractice,
  onAutoPracticeChange,
  practiceThresholdMinutesFar,
  onPracticeThresholdMinutesFarChange,
  practiceThresholdMinutesNear,
  onPracticeThresholdMinutesNearChange,
  practiceUrgentWindowDays,
  onPracticeUrgentWindowDaysChange,
  practiceMaxGap,
  onPracticeMaxGapChange,
}: PracticeSettingsSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="block text-sm text-ink-soft">
        <Toggle
          checked={autoPractice}
          onChange={onAutoPracticeChange}
          label="Auto-practice"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Automatically inserts practice nodes between lessons when the predicted time
          to clear your backlog crosses a threshold.
        </span>
      </div>

      <label className="block text-sm text-ink-soft">
        Threshold (exam not near)
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={practiceThresholdMinutesFar}
          onChange={(e) => onPracticeThresholdMinutesFarChange(e.target.value)}
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
          min={0}
          inputMode="numeric"
          value={practiceThresholdMinutesNear}
          onChange={(e) => onPracticeThresholdMinutesNearChange(e.target.value)}
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Minutes-to-clear at which a practice node is triggered once the exam is near
          (see the urgent window below). Typically lower than the far threshold.
        </span>
      </label>

      <label className="block text-sm text-ink-soft">
        Urgent window
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={practiceUrgentWindowDays}
          onChange={(e) => onPracticeUrgentWindowDaysChange(e.target.value)}
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
          min={1}
          inputMode="numeric"
          value={practiceMaxGap}
          onChange={(e) => onPracticeMaxGapChange(e.target.value)}
          className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Backstop: forces a practice node after this many lessons without one, even if
          neither threshold above has been crossed.
        </span>
      </label>
    </div>
  );
}
