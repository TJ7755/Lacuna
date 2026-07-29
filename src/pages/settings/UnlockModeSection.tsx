import { DateTimePicker } from '../../components/ui/DateTimePicker';
import type { UnlockMode } from '../../db/types';

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
  onLinearCadenceChange: (cadence: { anchorDate: number; intervalDays: number }) => void;
  timeZone?: string;
}

/**
 * Course-only unlock-mode picker: `open` | `semi-linear` | `linear`, with the
 * anchor-date/interval cadence inputs shown only under `linear`. Pure controlled
 * component — all state lives with the caller.
 */
export function UnlockModeSection({
  unlockMode,
  onUnlockModeChange,
  linearCadence,
  onLinearCadenceChange,
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
            onChange={(ms) =>
              onLinearCadenceChange({ ...linearCadence, anchorDate: ms })
            }
            timeZone={timeZone}
            label="First lesson unlocks on"
          />
          <label className="block text-sm text-ink-soft">
            Days between lessons
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={linearCadence.intervalDays}
              onChange={(e) =>
                onLinearCadenceChange({
                  ...linearCadence,
                  intervalDays: Math.max(1, Number(e.target.value) || 1),
                })
              }
              className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-ink-faint">
              Each lesson unlocks this many days after the previous one, starting from the
              date above. Overriding one lesson&apos;s date on its own page cascades to the rest.
            </span>
          </label>
        </div>
      )}
    </fieldset>
  );
}
