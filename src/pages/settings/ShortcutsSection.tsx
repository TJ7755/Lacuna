import { useEffect, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { KeyboardIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { ACTION_LABELS, formatBinding, useShortcutBindings, type LearnAction } from '../../state/shortcutBindings';
import { SettingsSectionHeading, SettingsSubsectionHeading } from './SettingsSectionHeading';

export function ShortcutsSection() {
  const shortcutBindings = useShortcutBindings();
  const { notify } = useToast();
  const [capturingAction, setCapturingAction] = useState<LearnAction | null>(null);

  return (
    <section
      id="settings-shortcuts"
      className="mb-8 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="mb-5 flex items-center gap-2 text-accent">
        <KeyboardIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl">Keyboard shortcuts</SettingsSectionHeading>
      </div>
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
            const conflict = (Object.keys(shortcutBindings.bindings) as LearnAction[]).find(
              (candidate) =>
                candidate !== capturingAction && shortcutBindings.bindings[candidate] === key,
            );
            if (conflict) {
              notify(`That key is already assigned to ${ACTION_LABELS[conflict]}.`, 'negative');
              return;
            }
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
    </section>
  );
}

function KeyCaptureOverlay({ action, onCapture, onCancel }: {
  action: LearnAction;
  onCapture: (key: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const instructionsId = useId();
  const trapRef = useFocusTrap(true, { autoFocusSelector: '[role="dialog"]' });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Tab') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead'].includes(event.key)) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[data-shortcut-cancel]') &&
        (event.key === 'Enter' || event.key === ' ')
      ) return;
      event.preventDefault();
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
    <div ref={trapRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={instructionsId}
        tabIndex={0}
        className="rounded-2xl border border-line-strong bg-surface px-8 py-6 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onClick={(event) => event.stopPropagation()}
      >
        <SettingsSubsectionHeading id={titleId} className="mb-2 font-display text-lg">
          Set shortcut for {ACTION_LABELS[action]}
        </SettingsSubsectionHeading>
        <p id={instructionsId} className="text-sm text-ink-soft">Press the key you want to use. Press Escape or click outside this card to cancel.</p>
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" size="sm" data-shortcut-cancel onClick={onCancel}>
            Cancel shortcut capture
          </Button>
        </div>
      </div>
    </div>
  );
}
