import { useEffect, useState } from 'react';
import { m as motion } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { KeyboardIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { ACTION_LABELS, formatBinding, useShortcutBindings, type LearnAction } from '../../state/shortcutBindings';

export function ShortcutsSection({ motionMultiplier }: { motionMultiplier: number }) {
  const shortcutBindings = useShortcutBindings();
  const { notify } = useToast();
  const [capturingAction, setCapturingAction] = useState<LearnAction | null>(null);

  return (
    <motion.section
      id="settings-shortcuts"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 * motionMultiplier, delay: 0.3 * motionMultiplier, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-1 flex items-center gap-2 text-accent">
        <KeyboardIcon width={18} height={18} />
        <h2 className="font-display text-xl">Keyboard shortcuts</h2>
      </div>
      <p className="mb-5 text-sm text-ink-soft">
        Customise the keys used while studying. Click any row then press the key you want to assign. Changes are remembered on this device.
      </p>
      <div className="flex flex-col gap-2">
        {(Object.keys(ACTION_LABELS) as LearnAction[]).map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => setCapturingAction(action)}
            className={cn(
              'flex items-center justify-between rounded-lg border px-4 py-2.5 text-left transition-colors',
              capturingAction === action ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong',
            )}
          >
            <span className="text-sm">{ACTION_LABELS[action]}</span>
            <kbd className={cn(
              'rounded border px-2 py-0.5 text-xs',
              capturingAction === action
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-line-strong bg-surface text-ink-faint',
            )}>
              {capturingAction === action ? 'Press a key…' : formatBinding(shortcutBindings.bindings[action])}
            </kbd>
          </button>
        ))}
      </div>
      {capturingAction && (
        <KeyCaptureOverlay
          action={capturingAction}
          onCapture={(key) => {
            shortcutBindings.setBinding(capturingAction, key);
            setCapturingAction(null);
            notify('Shortcut updated.', 'positive');
          }}
          onCancel={() => setCapturingAction(null)}
        />
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => {
          shortcutBindings.reset();
          notify('Shortcuts reset to defaults.', 'neutral');
        }}>
          Reset to defaults
        </Button>
      </div>
    </motion.section>
  );
}

function KeyCaptureOverlay({ action, onCapture, onCancel }: {
  action: LearnAction;
  onCapture: (key: string) => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      if (event.key === 'Escape') {
        onCancel();
        return;
      }
      if (['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock', 'Dead'].includes(event.key)) return;
      if (event.key === ' ') {
        onCapture('Space');
        return;
      }
      onCapture(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [action, onCapture, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onCancel}>
      <div className="rounded-2xl border border-line-strong bg-surface px-8 py-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <h3 className="mb-2 font-display text-lg">Set shortcut for {ACTION_LABELS[action]}</h3>
        <p className="text-sm text-ink-soft">Press the key you want to use. Press Escape or click outside this card to cancel.</p>
      </div>
    </div>
  );
}
