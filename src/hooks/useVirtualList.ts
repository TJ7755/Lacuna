import { useCallback, useEffect, useRef, useState, useMemo } from 'react';

interface VirtualItem {
  index: number;
  start: number;
  end: number;
  key: string;
}

interface UseVirtualListOptions {
  itemCount: number;
  estimateSize: number;
  gap?: number;
  overscan?: number;
  enabled?: boolean;
}

interface UseVirtualListResult {
  totalHeight: number;
  virtualItems: VirtualItem[];
  measureRef: (index: number) => (el: HTMLElement | null) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  scrollToIndex: (index: number) => void;
}

function scrollParent(element: HTMLElement): HTMLElement | Window {
  let parent = element.parentElement;
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
    parent = parent.parentElement;
  }
  return window;
}

/**
 * A lightweight, dependency-free virtual list hook that tracks scroll position
 * and renders only visible items. Items are absolutely positioned with translateY
 * so expanding/collapsing cards automatically reflow the layout via ResizeObserver.
 */
export function useVirtualList({
  itemCount,
  estimateSize,
  gap = 0,
  overscan = 3,
  enabled = true,
}: UseVirtualListOptions): UseVirtualListResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemHeights = useRef<Record<number, number>>({});
  const measureCallbacks = useRef(new Map<number, (el: HTMLElement | null) => void>());

  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [measureVersion, setMeasureVersion] = useState(0);

  // Clear cached heights when the item count changes. Keep the stable ref
  // callbacks: discarding them here loses their ResizeObservers without giving
  // React a chance to invoke the old callback with null.
  useEffect(() => {
    itemHeights.current = {};
    setMeasureVersion((version) => version + 1);
  }, [itemCount]);

  // Track the nearest scrolling ancestor. AppShell scrolls its <main>, not the
  // window, so listening only on window leaves a large list frozen at its first range.
  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;
    const root = scrollParent(el);
    let raf: number | null = null;
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const rect = el.getBoundingClientRect();
        const rootRect = root instanceof Window
          ? { top: 0, bottom: window.innerHeight, height: window.innerHeight }
          : root.getBoundingClientRect();
        const offset = Math.max(0, rootRect.top - rect.top);
        setScrollOffset(offset);
        setContainerHeight(rootRect.height);
      });
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  // Measure individual item heights and observe subsequent changes. Cards can
  // expand and font scaling can reflow them after mount, so a one-shot ref
  // measurement is insufficient for an absolutely positioned list.
  const measureRef = useCallback(
    (index: number) => {
      if (!measureCallbacks.current.has(index)) {
        let observer: ResizeObserver | null = null;
        let currentElement: HTMLElement | null = null;
        const updateHeight = (height: number) => {
          const prev = itemHeights.current[index];
          if (prev === height) return;
          itemHeights.current[index] = height;
          setMeasureVersion((v) => v + 1);
        };
        measureCallbacks.current.set(index, (el: HTMLElement | null) => {
          if (el === currentElement) return;
          observer?.disconnect();
          observer = null;
          currentElement = el;
          if (!el) return;
          updateHeight(el.getBoundingClientRect().height);
          if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver((entries) => {
              const entry = entries[0];
              if (entry) updateHeight(entry.contentRect.height);
            });
            observer.observe(el);
          }
        });
      }
      return measureCallbacks.current.get(index)!;
    },
    [],
  );

  // Recalculate layout when measurements change
  const { totalHeight, virtualItems } = useMemo(() => {
    // The version is the reactive counterpart to the height cache held in a ref.
    void measureVersion;
    if (!enabled) {
      return {
        totalHeight: 0,
        virtualItems: Array.from({ length: itemCount }, (_, index) => ({
          index,
          start: 0,
          end: 0,
          key: String(index),
        })),
      };
    }

    const heights: number[] = [];
    const starts: number[] = [];
    let current = 0;
    for (let i = 0; i < itemCount; i++) {
      starts[i] = current;
      const h = itemHeights.current[i] ?? estimateSize;
      heights[i] = h;
      current += h + gap;
    }
    const total = Math.max(0, current - gap);

    // Find visible range
    const startOffset = scrollOffset;
    const endOffset = scrollOffset + containerHeight;

    let startIndex = 0;
    let endIndex = itemCount - 1;

    // Binary search for start
    let lo = 0;
    let hi = itemCount - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (starts[mid] + heights[mid] < startOffset) {
        lo = mid + 1;
      } else {
        startIndex = mid;
        hi = mid - 1;
      }
    }

    // Binary search for end
    lo = 0;
    hi = itemCount - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (starts[mid] > endOffset) {
        endIndex = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    startIndex = Math.max(0, startIndex - overscan);
    endIndex = Math.min(itemCount - 1, endIndex + overscan);

    const items: VirtualItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      items.push({
        index: i,
        start: starts[i],
        end: starts[i] + heights[i],
        key: String(i),
      });
    }

    return { totalHeight: total, virtualItems: items };
  }, [
    enabled,
    itemCount,
    estimateSize,
    gap,
    overscan,
    scrollOffset,
    containerHeight,
    measureVersion,
  ]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = containerRef.current;
      if (!el) return;
      let offset = 0;
      for (let i = 0; i < index; i++) {
        offset += (itemHeights.current[i] ?? estimateSize) + gap;
      }
      const containerTop = el.getBoundingClientRect().top + window.scrollY;
      const root = scrollParent(el);
      if (root instanceof Window) {
        window.scrollTo({ top: containerTop + offset, behavior: 'smooth' });
      } else {
        const relativeTop = el.getBoundingClientRect().top - root.getBoundingClientRect().top;
        root.scrollTo({ top: root.scrollTop + relativeTop + offset, behavior: 'smooth' });
      }
    },
    [estimateSize, gap],
  );

  return { totalHeight, virtualItems, measureRef, containerRef, scrollToIndex };
}
