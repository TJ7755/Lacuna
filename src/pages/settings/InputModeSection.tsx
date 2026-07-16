import { m as motion } from 'motion/react';
import { KeyboardIcon } from '../../components/ui/icons';
import { cn } from '../../components/ui/cn';
import { useInputMode, type InputMode } from '../../state/inputMode';

const INPUT_OPTIONS: { key: InputMode; label: string; desc: string }[] = [
  { key: 'keyboard', label: 'Keyboard first', desc: 'Compact layout with shortcuts' },
  { key: 'touch', label: 'Touch first', desc: 'Large controls and gestures' },
  { key: 'auto', label: 'Auto', desc: 'Detect from the device' },
];

export function InputModeSection({ motionMultiplier }: { motionMultiplier: number }) {
  const [inputMode, setInputMode] = useInputMode();

  return (
    <motion.section
      id="settings-input"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.1 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <KeyboardIcon width={18} height={18} />
        <h2 className="font-display text-xl">Input mode</h2>
      </div>
      <p className="mb-4 text-sm text-ink-soft">
        Choose how Lacuna presents its interface. Keyboard-first keeps the compact,
        shortcut-driven layout. Touch-first enlarges controls, reveals gesture hints,
        and opens a bottom-sheet menu for reviewing and editing cards. Both modes
        stay fully functional — you can switch at any time.
      </p>
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
    </motion.section>
  );
}
