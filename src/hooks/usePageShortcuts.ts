import { useEffect, useRef } from 'react';

/** Single-key page shortcuts, keyed by lower-case key. Missing or undefined entries are inert. */
export type PageShortcuts = Record<string, (() => void) | undefined>;

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(
    el &&
      (el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable),
  );
}

/**
 * Plain-key shortcuts for the current page (S studies, N adds, / searches). Ignored while
 * typing, with modifiers held, or while any modal dialog is open. Listens in the capture
 * phase and stops the key so a page can claim one the shell also binds (such as "/").
 */
export function usePageShortcuts(shortcuts: PageShortcuts) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      const action = ref.current[e.key.toLowerCase()];
      if (!action) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      action();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
