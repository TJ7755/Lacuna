import { useCallback, useRef } from 'react';

/** Keep focus with an action when its control is replaced by a result. */
export function useActionFocus() {
  const trigger = useRef<Element | null>(null);
  const remember = useCallback(() => {
    trigger.current = document.activeElement === document.body ? null : document.activeElement;
  }, []);
  const restore = useCallback((element: HTMLElement | null) => {
    if (!element || !trigger.current) return;
    const active = document.activeElement;
    if (active === trigger.current || active === document.body || active === null) {
      element.focus({ preventScroll: true });
    }
    trigger.current = null;
  }, []);
  return { remember, restore };
}
