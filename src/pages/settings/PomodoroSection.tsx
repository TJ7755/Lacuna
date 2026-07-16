import { useState } from 'react';
import { m as motion } from 'motion/react';
import { ClockIcon } from '../../components/ui/icons';
import { Toggle } from '../../components/ui/Toggle';
import { loadPomodoroSettings, savePomodoroSettings, type PomodoroSettings } from '../../hooks/usePomodoro';

export function PomodoroSection({ motionMultiplier }: { motionMultiplier: number }) {
  const [settings, setSettings] = useState<PomodoroSettings>(loadPomodoroSettings);

  function update(next: PomodoroSettings) {
    setSettings(next);
    savePomodoroSettings(next);
  }

  return (
    <motion.section
      id="settings-pomodoro"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.35 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <ClockIcon width={18} height={18} />
        <h2 className="font-display text-xl">Pomodoro timer</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        A built-in focus timer for your study sessions. Customise the durations to match your own rhythm.
      </p>
      <div className="grid grid-cols-3 gap-4">
        <DurationInput label="Focus" value={settings.workMinutes} onChange={(value) => update({ ...settings, workMinutes: value })} />
        <DurationInput label="Short break" value={settings.shortBreakMinutes} onChange={(value) => update({ ...settings, shortBreakMinutes: value })} />
        <DurationInput label="Long break" value={settings.longBreakMinutes} onChange={(value) => update({ ...settings, longBreakMinutes: value })} />
      </div>
      <div className="mt-5 flex items-start justify-between gap-3 border-t border-line pt-5">
        <div className="min-w-0">
          <div className="text-sm">Auto-start breaks</div>
          <p className="mt-1 text-sm text-ink-soft">Automatically start the break timer when a focus session ends.</p>
        </div>
        <Toggle checked={settings.autoStartBreaks} onChange={(checked) => update({ ...settings, autoStartBreaks: checked })} />
      </div>
    </motion.section>
  );
}

function DurationInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm text-ink-soft">
      {label}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
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
