import { useCallback, useEffect, useRef, useState } from 'react';

/** Which edges of a scroll container still have content beyond them. */
export interface ScrollEdges {
  top: boolean;
  bottom: boolean;
}

/**
 * Tracks whether a vertically scrolling element has hidden content above or below,
 * so a list without a visible scrollbar can fade the edge that hides something.
 */
export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ top: false, bottom: false });
  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const top = element.scrollTop > 1;
    const bottom = element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    setEdges((current) =>
      current.top === top && current.bottom === bottom ? current : { top, bottom },
    );
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    // Rows arriving or expanding change the content height without resizing the box.
    const mutations = new MutationObserver(measure);
    mutations.observe(element, { childList: true, subtree: true });
    return () => {
      element.removeEventListener('scroll', measure);
      observer?.disconnect();
      mutations.disconnect();
    };
  }, [measure]);
  return [ref, edges] as const;
}

/** Fades whichever edges hide content; pass the result as an inline mask. */
export function scrollEdgeMask({ top, bottom }: ScrollEdges): string | undefined {
  if (!top && !bottom) return undefined;
  return `linear-gradient(to bottom, ${top ? 'transparent, black 24px' : 'black'}, ${
    bottom ? 'black calc(100% - 24px), transparent' : 'black'
  })`;
}
