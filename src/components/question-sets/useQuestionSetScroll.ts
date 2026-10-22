import { useEffect, useRef } from 'react';
import { useIsPresent } from 'motion/react';

/** Restore after content loads; query edits can share a pageKey without restoring mid-input. */
export function useQuestionSetScroll(key: string, ready = true, pageKey = key) {
  const root = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  const storageKey = useRef(key);
  const restoredPage = useRef(pageKey);
  const restoreFrame = useRef(0);
  const restoring = useRef(false);
  useEffect(() => {
    if (!present || storageKey.current === key || root.current?.closest('[inert]')) return;
    cancelAnimationFrame(restoreFrame.current);
    restoring.current = false;
    storageKey.current = key;
    const scroller = root.current?.closest('main');
    if (scroller && restoredPage.current === pageKey) {
      sessionStorage.setItem(key, String(scroller.scrollTop));
    }
    restoredPage.current = pageKey;
  }, [key, pageKey, present]);
  useEffect(() => {
    const scroller = root.current?.closest('main');
    if (!present || !ready || !scroller) return;
    const saved = Number(sessionStorage.getItem(storageKey.current) ?? 0);
    const target = Number.isFinite(saved) ? Math.max(0, saved) : 0;
    const deadline = performance.now() + 1200;
    restoring.current = true;
    const restore = () => {
      if (!root.current?.isConnected || root.current.closest('[inert]')) {
        restoring.current = false;
        return;
      }
      scroller.scrollTop = target;
      if (Math.abs(scroller.scrollTop - target) > 1 && performance.now() < deadline) {
        restoreFrame.current = requestAnimationFrame(restore);
      } else restoring.current = false;
    };
    restoreFrame.current = requestAnimationFrame(restore);
    const save = () => {
      if (restoring.current || !root.current?.isConnected || root.current.closest('[inert]'))
        return;
      sessionStorage.setItem(storageKey.current, String(scroller.scrollTop));
    };
    scroller.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelAnimationFrame(restoreFrame.current);
      restoring.current = false;
      scroller.removeEventListener('scroll', save);
    };
  }, [pageKey, ready, present]);
  return root;
}
