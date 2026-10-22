import { useEffect, useRef } from 'react';

/** Restore after content loads; query edits can share a pageKey without restoring mid-input. */
export function useQuestionSetScroll(key: string, ready = true, pageKey = key) {
  const root = useRef<HTMLDivElement>(null);
  const storageKey = useRef(key);
  const restoredPage = useRef(pageKey);
  useEffect(() => {
    if (storageKey.current === key) return;
    storageKey.current = key;
    const scroller = root.current?.closest('main');
    if (scroller && restoredPage.current === pageKey) {
      sessionStorage.setItem(key, String(scroller.scrollTop));
    }
    restoredPage.current = pageKey;
  }, [key, pageKey]);
  useEffect(() => {
    const scroller = root.current?.closest('main');
    if (!ready || !scroller) return;
    const saved = Number(sessionStorage.getItem(storageKey.current) ?? 0);
    const frame = requestAnimationFrame(() => {
      scroller.scrollTop = Number.isFinite(saved) ? Math.max(0, saved) : 0;
    });
    const save = () => sessionStorage.setItem(storageKey.current, String(scroller.scrollTop));
    scroller.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', save);
    };
  }, [pageKey, ready]);
  return root;
}
