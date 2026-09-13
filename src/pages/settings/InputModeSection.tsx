import { KeyboardIcon } from '../../components/ui/icons';
import { cn } from '../../components/ui/cn';
import { useInputMode, type InputMode } from '../../state/inputMode';
import { SettingsSectionHeading } from './SettingsSectionHeading';

const INPUT_OPTIONS: { key: InputMode; label: string; desc: string }[] = [
  { key: 'keyboard', label: 'Keyboard first', desc: 'Compact layout with shortcuts' },
  { key: 'touch', label: 'Touch first', desc: 'Large controls and gestures' },
  { key: 'auto', label: 'Auto', desc: 'Detect from the device' },
];

export function InputModeSection() {
  const [inputMode, setInputMode] = useInputMode();

  return (
    <section
      id="settings-input"
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-4 flex items-center gap-2 text-accent">
        <KeyboardIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl">Input mode</SettingsSectionHeading>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {INPUT_OPTIONS.map((option) => {
          const active = inputMode === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setInputMode(option.key)}
              aria-pressed={active}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                active
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-ink-soft hover:border-line-strong',
              )}
            >
              <div className="font-medium">{option.label}</div>
              <div className="mt-0.5 text-xs text-ink-faint">{option.desc}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
