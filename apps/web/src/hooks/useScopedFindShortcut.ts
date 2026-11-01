import { useEffect, useRef } from 'react';

/** Leave browser Find alone outside deck views and while another editor owns input. */
export function useScopedFindShortcut(open: (() => void) | undefined) {
  const action = useRef(open);
  action.current = open;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'f'
      )
        return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        document.querySelector('[role="dialog"][aria-modal="true"]') ||
        target?.closest(
          '[contenteditable]:not([contenteditable="false"]), textarea, [role="textbox"]',
        ) ||
        (target?.tagName === 'INPUT' && !target.hasAttribute('data-scoped-find'))
      )
        return;
      if (!action.current) return;
      event.preventDefault();
      action.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
