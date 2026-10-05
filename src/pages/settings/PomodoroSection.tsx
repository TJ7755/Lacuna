import { useState } from 'react';
import { ClockIcon } from '../../components/ui/icons';
import {
  loadPomodoroSettings,
  savePomodoroSettings,
  type PomodoroSettings,
} from '../../hooks/usePomodoro';
import { SettingsSectionHeading } from './SettingsSectionHeading';
import { PillSwitch, SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';
import { cn } from '../../components/ui/cn';

export function PomodoroSection() {
  const [settings, setSettings] = useState<PomodoroSettings>(loadPomodoroSettings);

  function update(next: PomodoroSettings) {
    setSettings(next);
    savePomodoroSettings(next);
  }

  return (
    <SettingsCard id="settings-pomodoro">
      <div className={cn('mb-5', SETTINGS_HEADING_ROW_CLASS)}>
        <ClockIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Pomodoro timer
        </SettingsSectionHeading>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <DurationInput
          label="Focus"
          value={settings.workMinutes}
          onChange={(value) => update({ ...settings, workMinutes: value })}
        />
        <DurationInput
          label="Short break"
          value={settings.shortBreakMinutes}
          onChange={(value) => update({ ...settings, shortBreakMinutes: value })}
        />
        <DurationInput
          label="Long break"
          value={settings.longBreakMinutes}
          onChange={(value) => update({ ...settings, longBreakMinutes: value })}
        />
      </div>
      <div className="mt-5 flex items-start justify-between gap-3 pt-0">
        <div className="min-w-0">
          <div className="text-sm">Auto-start breaks</div>
        </div>
        <PillSwitch
          checked={settings.autoStartBreaks}
          onChange={(checked) => update({ ...settings, autoStartBreaks: checked })}
          ariaLabel="Auto-start breaks"
        />
      </div>
    </SettingsCard>
  );
}

function DurationInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm text-ink-soft">
      {label}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          aria-label={`${label} duration, in minutes`}
          min={1}
          max={120}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isNaN(next)) onChange(Math.max(1, Math.min(120, next)));
          }}
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-ink outline-none transition-colors focus:border-accent"
        />
        <span className="shrink-0 text-xs text-ink-faint">min</span>
      </div>
    </label>
  );
}
