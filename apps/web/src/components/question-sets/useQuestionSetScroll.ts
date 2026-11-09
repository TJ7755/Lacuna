import { useEffect, useRef } from 'react';
import { useIsPresent } from 'motion/react';
import { restoreScrollPosition } from '../layout/scrollRestoration';

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** Restore after content loads; query edits can share a pageKey without restoring mid-input. */
export function useQuestionSetScroll(key: string, ready = true, pageKey = key) {
  const root = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  const storageKey = useRef(key);
  const restoredPage = useRef(pageKey);
  const cancelRestore = useRef<(() => void) | undefined>(undefined);
  const restoring = useRef(false);
  useEffect(() => {
    if (!present || storageKey.current === key || root.current?.closest('[inert]')) return;
    cancelRestore.current?.();
    restoring.current = false;
    storageKey.current = key;
    const scroller = root.current?.closest('main');
    if (scroller && restoredPage.current === pageKey) {
      sessionStorage.setItem(key, String(scroller.scrollTop));
    }
    restoredPage.current = pageKey;
  }, [key, pageKey, present]);
  useEffect(() => {
    const element = root.current;
    if (!present || !ready || !element) return;
    const scroller = element.closest('main');
    if (!scroller) return;
    const saved = Number(sessionStorage.getItem(storageKey.current) ?? 0);
    const target = Number.isFinite(saved) ? Math.max(0, saved) : 0;
    const isCurrent = () => element.isConnected && !element.closest('[inert]');
    const remember = (top: number) => sessionStorage.setItem(storageKey.current, String(top));
    restoring.current = true;
    let stopRestoration: (() => void) | undefined;
    const finish = (learnerPosition?: number) => {
      stop();
      restoring.current = false;
      if (learnerPosition !== undefined) remember(learnerPosition);
    };
    // At a scroll boundary these gestures may not produce a scroll event.
    const yieldToInput = () => {
      if (isCurrent()) finish(scroller.scrollTop);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY && !event.ctrlKey && !event.defaultPrevented) yieldToInput();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1 && !event.defaultPrevented) yieldToInput();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!SCROLL_KEYS.has(event.key)) return;
      const focused = event.target;
      if (focused instanceof HTMLElement && focused !== document.body) {
        if (!scroller.contains(focused)) return;
        if (focused.isContentEditable || focused.matches('input, textarea, select')) return;
        if (event.key === ' ' && focused.closest('button, summary, [role="button"]')) return;
      }
      yieldToInput();
    };
    const frame = requestAnimationFrame(() => {
      if (isCurrent()) {
        stopRestoration = restoreScrollPosition(scroller, target, { isCurrent, onFinish: finish });
      } else finish();
    });
    const stop = () => {
      cancelAnimationFrame(frame);
      stopRestoration?.();
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
    };
    cancelRestore.current = stop;
    scroller.addEventListener('wheel', onWheel, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    const save = () => {
      if (!restoring.current && isCurrent()) remember(scroller.scrollTop);
    };
    scroller.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelRestore.current?.();
      cancelRestore.current = undefined;
      restoring.current = false;
      scroller.removeEventListener('scroll', save);
    };
  }, [pageKey, ready, present]);
  return root;
}
