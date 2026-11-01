import { useEffect, type RefObject } from 'react';

/**
 * Moves focus to a screen's first enabled action when the screen that held focus has gone
 * (focus fell back to the body). A control the learner has since chosen keeps its focus.
 */
export function useUnclaimedFocus(container: RefObject<HTMLElement | null>, ready = true) {
  useEffect(() => {
    if (!ready) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body && !active.closest('[inert]')) return;
    container.current
      ?.querySelector<HTMLElement>('button:not(:disabled)')
      ?.focus({ preventScroll: true });
  }, [container, ready]);
}
