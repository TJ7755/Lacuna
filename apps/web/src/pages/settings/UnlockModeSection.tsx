import { useId } from 'react';
import { DateTimePicker } from '../../components/ui/DateTimePicker';
import type { UnlockMode } from '@lacuna/core/db/types';
import { SegmentedPills } from '../../components/ui/SegmentedPills';
import { NumberField } from './NumberField';

const MODES: readonly { value: UnlockMode; label: string; description: string }[] = [
  {
    value: 'open',
    label: 'Open',
    description: 'Every lesson is unlocked from the start, so you can work ahead freely.',
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
      'Lessons unlock on a schedule of dates. This uses your device clock, so treat it as an ' +
      'honour system rather than a hard lock.',
  },
];

const OPTIONS = MODES.map(({ value, label }) => ({ value, label }));

export interface UnlockModeSectionProps {
  unlockMode: UnlockMode;
  onUnlockModeChange: (mode: UnlockMode) => void;
  linearCadence: { anchorDate: number; intervalDays: number };
  /** Discrete date pick — the caller commits this immediately, like a select. */
  onAnchorDateChange: (anchorDate: number) => void;
  /** Free-typed field — called only with a valid value, on Enter or blur. */
  onIntervalDaysCommit: (intervalDays: number) => void;
  timeZone?: string;
}

/**
 * Course-only unlock-mode picker: `open` | `semi-linear` | `linear`. Only the selected mode is
 * described, and the anchor-date/interval cadence inputs appear only under `linear`. Pure controlled
 * component — all state lives with the caller, which also owns the instant-commit
 * mechanics (see the prop docs above).
 */
export function UnlockModeSection({
  unlockMode,
  onUnlockModeChange,
  linearCadence,
  onAnchorDateChange,
  onIntervalDaysCommit,
  timeZone,
}: UnlockModeSectionProps) {
  const descriptionId = useId();
  const selected = MODES.find((mode) => mode.value === unlockMode) ?? MODES[0];
  return (
    <div>
      <h3 className="font-semibold text-ink">Lesson unlocking</h3>
      <SegmentedPills
        label="Lesson unlocking"
        size="sm"
        value={unlockMode}
        options={OPTIONS}
        onChange={onUnlockModeChange}
        describedBy={descriptionId}
        className="mt-3 w-fit max-w-full"
      />
      <p id={descriptionId} className="mt-2 text-sm text-ink-soft">
        {selected.description}
      </p>

      {unlockMode === 'linear' && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <DateTimePicker
            value={linearCadence.anchorDate}
            onChange={onAnchorDateChange}
            timeZone={timeZone}
            label="First lesson unlocks on"
          />
          <NumberField
            label="Days between lessons"
            value={linearCadence.intervalDays}
            min={1}
            onCommit={onIntervalDaysCommit}
            hint={
              <>Overriding one lesson&apos;s date on its own page moves the later lessons too.</>
            }
          />
        </div>
      )}
    </div>
  );
}
