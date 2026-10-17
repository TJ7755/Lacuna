import { ModalBackdrop } from './ModalBackdrop';
import { AnimatePresence, m as motion, useIsPresent, type HTMLMotionProps } from 'motion/react';
import type { RefObject } from 'react';
import { shortcutGroups } from '../../state/shortcutGroups';
import { loadBindings, keyMatches } from '../../state/shortcutBindings';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { CloseIcon } from './icons';

function HintsOverlay({
  trapRef,
  ...props
}: HTMLMotionProps<'div'> & { trapRef: RefObject<HTMLDivElement | null> }) {
  const present = useIsPresent();
  return (
    <motion.div {...props} ref={trapRef} inert={!present} aria-hidden={!present || undefined} />
  );
}

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
        <HintsOverlay
          trapRef={trapRef}
          className="fixed inset-0 z-[60] flex items-center justify-center pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return;
            if (e.key === 'Escape' || keyMatches(e.nativeEvent, bindings.help)) {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
          data-testid="keyhints-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <ModalBackdrop shade={50} onClick={onClose} />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-line-strong bg-paper card-surface will-change-transform-opacity"
          >
            <header className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="font-display text-xl">Keyboard shortcuts</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                title="Close (Esc)"
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <CloseIcon width={18} height={18} />
              </button>
            </header>

            <div className="grid gap-6 px-6 py-6 sm:grid-cols-2">
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
                              className="rounded border border-line-strong bg-surface px-1.5 py-0.5 text-[11px] text-ink-faint"
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
          </motion.div>
        </HintsOverlay>
      )}
    </AnimatePresence>
  );
}
