import { DateTimePicker } from '../../components/ui/DateTimePicker';
import type { UnlockMode } from '../../db/types';
import { Field, Input } from '../../components/ui/Field';

const MODES: { value: UnlockMode; label: string; description: string }[] = [
  {
    value: 'open',
    label: 'Open',
    description: 'Every lesson is unlocked from the start; students can work ahead freely.',
  },
  {
    value: 'semi-linear',
    label: 'Semi-linear',
    description: 'Each lesson unlocks once the previous one is completed.',
  },
  {
    value: 'linear',
    label: 'Linear',
    description:
      'Lessons unlock on a cadence of dates. Enforced by the student’s own device clock, ' +
      'not a server, so treat it as an honour system rather than a hard lock.',
  },
];

export interface UnlockModeSectionProps {
  unlockMode: UnlockMode;
  onUnlockModeChange: (mode: UnlockMode) => void;
  linearCadence: { anchorDate: number; intervalDays: number };
  /** Discrete date pick — the caller commits this immediately, like a select. */
  onAnchorDateChange: (anchorDate: number) => void;
  /** Free-typed field — updates local state only; commits on blur via `onIntervalDaysBlur`. */
  onIntervalDaysChange: (intervalDays: number) => void;
  onIntervalDaysBlur: () => void;
  timeZone?: string;
}

/**
 * Course-only unlock-mode picker: `open` | `semi-linear` | `linear`, with the
 * anchor-date/interval cadence inputs shown only under `linear`. Pure controlled
 * component — all state lives with the caller, which also owns the instant-commit
 * mechanics (see the `on*Change`/`on*Blur` prop docs above).
 */
export function UnlockModeSection({
  unlockMode,
  onUnlockModeChange,
  linearCadence,
  onAnchorDateChange,
  onIntervalDaysChange,
  onIntervalDaysBlur,
  timeZone,
}: UnlockModeSectionProps) {
  return (
    <fieldset className="block text-sm text-ink-soft">
      <legend className="mb-2 font-medium text-ink">Lesson unlocking</legend>
      <div className="flex flex-col gap-2">
        {MODES.map((mode) => (
          <label key={mode.value} className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name="unlockMode"
              value={mode.value}
              checked={unlockMode === mode.value}
              onChange={() => onUnlockModeChange(mode.value)}
              className="mt-0.5 accent-accent"
            />
            <span>
              <span className="block text-sm text-ink">{mode.label}</span>
              <span className="block text-xs text-ink-faint">{mode.description}</span>
            </span>
          </label>
        ))}
      </div>

      {unlockMode === 'linear' && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <DateTimePicker
            value={linearCadence.anchorDate}
            onChange={onAnchorDateChange}
            timeZone={timeZone}
            label="First lesson unlocks on"
          />
          <Field
            label="Days between lessons"
            hint={
              <>
                Each lesson unlocks this many days after the previous one, starting from the date
                above. Overriding one lesson&apos;s date on its own page cascades to the rest.
              </>
            }
          >
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={linearCadence.intervalDays}
              onChange={(e) => onIntervalDaysChange(Math.max(1, Number(e.target.value) || 1))}
              onBlur={onIntervalDaysBlur}
            />
          </Field>
        </div>
      )}
    </fieldset>
  );
}
