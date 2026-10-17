import { AnimatePresence, useIsPresent } from 'motion/react';
import { DialogPanel } from '../../components/ui/DialogPanel';
import { useEffect, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { KeyboardIcon } from '../../components/ui/icons';
import { useToast } from '../../components/ui/Toast';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  ACTION_LABELS,
  bindingError,
  formatBinding,
  useShortcutBindings,
  type LearnAction,
} from '../../state/shortcutBindings';
import { SettingsSectionHeading, SettingsSubsectionHeading } from './SettingsSectionHeading';
import { SETTINGS_HEADING_ROW_CLASS, SettingsCard } from './SettingsUi';

export function ShortcutsSection() {
  const shortcutBindings = useShortcutBindings();
  const { notify } = useToast();
  const [capturingAction, setCapturingAction] = useState<LearnAction | null>(null);

  return (
    <SettingsCard id="settings-shortcuts">
      <div className={cn('mb-5', SETTINGS_HEADING_ROW_CLASS)}>
        <KeyboardIcon width={18} height={18} />
        <SettingsSectionHeading className="font-display text-xl font-semibold tracking-tight">
          Keyboard shortcuts
        </SettingsSectionHeading>
      </div>
      <div className="flex flex-col gap-2">
        {(Object.keys(ACTION_LABELS) as LearnAction[]).map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => setCapturingAction(action)}
            className={cn(
              'flex items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-colors',
              capturingAction === action
                ? 'border-accent bg-accent-soft'
                : 'border-line hover:border-line-strong',
            )}
          >
            <span className="text-sm">{ACTION_LABELS[action]}</span>
            <kbd
              className={cn(
                'rounded border px-2 py-0.5 text-xs',
                capturingAction === action
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-line-strong bg-surface text-ink-faint',
              )}
            >
              {capturingAction === action
                ? 'Press a key…'
                : formatBinding(shortcutBindings.bindings[action])}
            </kbd>
          </button>
        ))}
      </div>
      <AnimatePresence>
        {capturingAction && (
          <KeyCaptureOverlay
            action={capturingAction}
            onCapture={(key) => {
              const error = bindingError(capturingAction, key, shortcutBindings.bindings);
              if (error) {
                notify(error, 'negative');
                return;
              }
              shortcutBindings.setBinding(capturingAction, key);
              setCapturingAction(null);
              notify('Shortcut updated.', 'positive');
            }}
            onReject={(message) => notify(message, 'negative')}
            onCancel={() => setCapturingAction(null)}
          />
        )}
      </AnimatePresence>
      <div className="mt-4 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            shortcutBindings.reset();
            notify('Shortcuts reset to defaults.', 'neutral');
          }}
        >
          Reset to defaults
        </Button>
      </div>
    </SettingsCard>
  );
}

function KeyCaptureOverlay({
  action,
  onCapture,
  onReject,
  onCancel,
}: {
  action: LearnAction;
  onCapture: (key: string) => void;
  onReject: (message: string) => void;
  onCancel: () => void;
}) {
  const present = useIsPresent();
  const instructionsId = useId();
  const trapRef = useFocusTrap(present, { autoFocusSelector: '[role="dialog"]' });

  useEffect(() => {
    if (!present) return;
    const handler = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.key === 'Process' ||
        event.key === 'Dead'
      )
        return;
      if (event.key === 'Tab') return;
      if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(event.key)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        onReject('Use a single key without Ctrl, Cmd or Alt.');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[data-shortcut-cancel]') &&
        (event.key === 'Enter' || event.key === ' ')
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === ' ') {
        onCapture('Space');
        return;
      }
      onCapture(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [action, onCapture, onCancel, onReject, present]);

  return (
    <DialogPanel
      label={`Set shortcut for ${ACTION_LABELS[action]}`}
      describedBy={instructionsId}
      trapRef={trapRef}
      onKeyDown={() => {}}
      onBackdropClick={onCancel}
      tabIndex={0}
      className="max-w-md overflow-y-auto p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
    >
      <SettingsSubsectionHeading className="mb-2 font-display text-xl">
        Set shortcut for {ACTION_LABELS[action]}
      </SettingsSubsectionHeading>
      <p id={instructionsId} className="text-sm text-ink-soft">
        Press the key you want to use. Press Escape or click outside this card to cancel.
      </p>
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="ghost" size="sm" data-shortcut-cancel onClick={onCancel}>
          Cancel shortcut capture
        </Button>
      </div>
    </DialogPanel>
  );
}
