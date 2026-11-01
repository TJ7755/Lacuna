import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * True once the referenced element has scrolled into view, and stays true. Charts mount
 * their drawing animation when this flips, so each one plays as it arrives rather than
 * while it is still off-screen. With motion off, or where IntersectionObserver is
 * unavailable, it is true from the first render.
 */
export function useRevealOnce<T extends Element>(
  disabled: boolean,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(
    () => disabled || typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    const element = ref.current;
    if (revealed || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [revealed]);

  return [ref, revealed];
}
