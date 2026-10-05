import { useEffect, useRef } from 'react';

/** Restore only after the asynchronously loaded content can occupy its saved position. */
export function useQuestionSetScroll(key: string, ready = true) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = root.current?.closest('main');
    if (!ready || !scroller) return;
    const saved = Number(sessionStorage.getItem(key) ?? 0);
    const frame = requestAnimationFrame(() => {
      scroller.scrollTop = Number.isFinite(saved) ? Math.max(0, saved) : 0;
    });
    const save = () => sessionStorage.setItem(key, String(scroller.scrollTop));
    scroller.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', save);
    };
  }, [key, ready]);
  return root;
}
