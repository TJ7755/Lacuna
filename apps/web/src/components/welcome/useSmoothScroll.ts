import { useEffect } from 'react';

const REFERENCE_FRAME_MS = 1000 / 60;

/**
 * Deliberately slowed, inertial wheel scrolling for the landing page.
 * Wheel input is intercepted and eased towards its target with a lerp, giving
 * scrolling a heavier, more considered feel. Touch, keyboard and scrollbar
 * input are left native, and the hook stands down entirely when disabled or
 * when the visitor prefers reduced motion.
 */
export function useSmoothScroll(enabled: boolean, consumeDemoScroll?: (deltaY: number) => boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let target = window.scrollY;
    let current = window.scrollY;
    let raf = 0;
    let lastUpdate: number | undefined;

    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

    const advance = (timestamp: number) => {
      // Keep the original 60 Hz easing over elapsed time on any display.
      const elapsed = lastUpdate === undefined ? REFERENCE_FRAME_MS : timestamp - lastUpdate;
      // A frame timestamp can precede a wheel callback processed in the same frame.
      if (elapsed <= 0) return;
      lastUpdate = timestamp;
      const remaining = 0.91 ** (elapsed / REFERENCE_FRAME_MS);
      current += (target - current) * (1 - remaining);
    };

    const step = (timestamp: number) => {
      advance(timestamp);
      if (Math.abs(target - current) < 0.5) {
        current = target;
        raf = 0;
        lastUpdate = undefined;
      } else {
        raf = requestAnimationFrame(step);
      }
      // Instant, or the CSS smooth-scroll on <html> would fight the lerp.
      window.scrollTo({ top: current, behavior: 'instant' });
    };

    const onWheel = (event: WheelEvent) => {
      // Leave pinch-zoom gestures (ctrl+wheel) alone.
      if (event.ctrlKey) return;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (delta > 0 && consumeDemoScroll?.(delta)) {
        event.preventDefault();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        lastUpdate = undefined;
        target = window.scrollY;
        current = window.scrollY;
        return;
      }
      event.preventDefault();
      // Elapsed time before this tick belongs to the previous target.
      if (lastUpdate !== undefined) advance(performance.now());
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
  }, [consumeDemoScroll, enabled]);
}
