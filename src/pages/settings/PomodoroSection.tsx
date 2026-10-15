import { useState } from 'react';
import { ClockIcon } from '../../components/ui/icons';
import {
  loadPomodoroSettings,
  savePomodoroSettings,
  type PomodoroSettings,
} from '../../hooks/usePomodoro';
import { NumberField } from './NumberField';
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
          max={120}
          value={settings.workMinutes}
          onChange={(value) => update({ ...settings, workMinutes: value })}
        />
        <DurationInput
          label="Short break"
          max={60}
          value={settings.shortBreakMinutes}
          onChange={(value) => update({ ...settings, shortBreakMinutes: value })}
        />
        <DurationInput
          label="Long break"
          max={60}
          value={settings.longBreakMinutes}
          onChange={(value) => update({ ...settings, longBreakMinutes: value })}
        />
      </div>
      <div className="mt-5 flex items-start justify-between gap-3 pt-0">
        <div className="min-w-0">
          <div className="font-semibold text-ink">Auto-start breaks</div>
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
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberField
      label={label}
      ariaLabel={`${label} duration, in minutes`}
      value={value}
      suffix="min"
      min={1}
      max={max}
      onCommit={onChange}
    />
  );
}
