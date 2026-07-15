import { useEffect } from 'react';

/**
 * Deliberately slowed, inertial wheel scrolling for the landing page.
 * Wheel input is intercepted and eased towards its target with a lerp, giving
 * scrolling a heavier, more considered feel. Touch, keyboard and scrollbar
 * input are left native, and the hook stands down entirely when disabled or
 * when the visitor prefers reduced motion.
 */
export function useSmoothScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let target = window.scrollY;
    let current = window.scrollY;
    let raf = 0;

    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

    const step = () => {
      current += (target - current) * 0.09;
      if (Math.abs(target - current) < 0.5) {
        current = target;
        raf = 0;
      } else {
        raf = requestAnimationFrame(step);
      }
      // Instant, or the CSS smooth-scroll on <html> would fight the lerp.
      window.scrollTo({ top: current, behavior: 'instant' });
    };

    const onWheel = (event: WheelEvent) => {
      // Leave pinch-zoom gestures (ctrl+wheel) alone.
      if (event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      target = Math.min(maxScroll(), Math.max(0, target + delta * 0.85));
      if (!raf) raf = requestAnimationFrame(step);
    };

    // Keyboard, scrollbar or anchor scrolling moves the page without us;
    // resync so the next wheel tick continues from where the reader is.
    const onScroll = () => {
      if (!raf) {
        target = window.scrollY;
        current = window.scrollY;
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);
}
