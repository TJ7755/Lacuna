import { useEffect, useRef, useState } from 'react';

/**
 * Marks an element as revealed once it scrolls into view, exactly once.
 * Returns a ref to attach and a boolean to drive enter transitions.
 */
export function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Fire slightly after the element clears the bottom edge so the
      // transition is actually seen rather than finished off-screen.
      { rootMargin: '0px 0px -12% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}
