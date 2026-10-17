import { AnimatePresence } from 'motion/react';
import { shortcutGroups } from '../../state/shortcutGroups';
import { loadBindings, keyMatches } from '../../state/shortcutBindings';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { DialogHeader, DialogPanel } from './DialogPanel';

/**
 * A keyboard-shortcuts cheatsheet, opened with the configured help key ("?" by default). Its contents come from
 * the shared SHORTCUT_GROUPS registry so it always matches the real handlers.
 */
export function KeyHints({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trapRef = useFocusTrap(open);
  // A read-only view must refresh on reopen without persisting stale overrides.
  const bindings = loadBindings();

  const liveGroups = shortcutGroups(bindings);

  return (
    <AnimatePresence>
      {open && (
        <DialogPanel
          label="Keyboard shortcuts"
          trapRef={trapRef}
          overlayClassName="z-[60]"
          className="max-w-lg"
          testId="keyhints-dialog"
          onBackdropClick={onClose}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return;
            if (e.key === 'Escape' || keyMatches(e.nativeEvent, bindings.help)) {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <DialogHeader title="Keyboard shortcuts" onClose={onClose} closeLabel="Close" />
          <div className="grid min-h-0 gap-6 overflow-y-auto overscroll-contain px-6 py-6 sm:grid-cols-2">
            {liveGroups.map((group) => (
              <div key={group.title}>
                <h3 className="mb-2 font-display text-lg text-ink">{group.title}</h3>
                <ul className="flex flex-col gap-2">
                  {group.shortcuts.map((s) => (
                    <li
                      key={s.description}
                      className="flex items-center justify-between gap-3 text-sm text-ink-soft"
                    >
                      <span>{s.description}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {s.keys.map((k) => (
                          <kbd
                            key={k}
                            className="rounded border border-line-strong bg-surface px-1.5 py-0.5 text-xs text-ink-faint"
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogPanel>
      )}
    </AnimatePresence>
  );
}
