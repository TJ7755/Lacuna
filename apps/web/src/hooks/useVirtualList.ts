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
  /** Retain active editors/toolbars while their section is outside the window. */
  pinnedIndices?: readonly number[];
}

interface UseVirtualListResult {
  totalHeight: number;
  virtualItems: VirtualItem[];
  measureRef: (index: number) => (el: HTMLElement | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
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
  pinnedIndices,
}: UseVirtualListOptions): UseVirtualListResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemHeights = useRef<Record<number, number>>({});
  const measuredElements = useRef(new Map<number, HTMLElement>());
  const measuredIndices = useRef(new Map<Element, number>());
  const itemObserver = useRef<ResizeObserver | null>(null);
  const measureCallbacks = useRef(new Map<number, (el: HTMLElement | null) => void>());

  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [measureVersion, setMeasureVersion] = useState(0);

  // Clear cached heights when the item count changes. Keep the stable ref
  // callbacks: discarding them here loses their ResizeObservers without giving
  // React a chance to invoke the old callback with null.
  useEffect(() => {
    if (!enabled) return;
    itemHeights.current = {};
    // Mounted rows retain their callback refs when cards are added or removed.
    // Rebuild their measurements rather than waiting for a resize that may never occur.
    for (const [index, element] of measuredElements.current) {
      const height = element.getBoundingClientRect().height;
      if (index < itemCount && height > 0) itemHeights.current[index] = height;
    }
    setMeasureVersion((version) => version + 1);
  }, [itemCount, enabled]);

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
        const rootRect =
          root instanceof HTMLElement
            ? root.getBoundingClientRect()
            : { top: 0, height: window.innerHeight };
        // Keep negative offsets: later lesson lists can sit below the viewport.
        // Clamping to zero gives every off-screen list a full viewport of rows.
        const offset = rootRect.top - rect.top;
        setScrollOffset(offset);
        setContainerHeight(rootRect.height);
      });
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // Loading content or measuring an earlier lesson can move this list without a
    // scroll event. Observe the shared layout so off-screen lessons keep their range.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onScroll);
    let ancestor: HTMLElement | null = el;
    while (ancestor) {
      observer?.observe(ancestor);
      if (ancestor === root) break;
      ancestor = ancestor.parentElement;
    }
    onScroll();
    return () => {
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      observer?.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  // Measure individual item heights and observe subsequent changes. Cards can
  // expand and font scaling can reflow them after mount, so a one-shot ref
  // measurement is insufficient for an absolutely positioned list.
  const measureRef = useCallback((index: number) => {
    function updateHeight(index: number, height: number): boolean {
      // Hidden or not-yet-laid-out rows must retain their previous size estimate.
      if (height <= 0 || itemHeights.current[index] === height) return false;
      itemHeights.current[index] = height;
      return true;
    }
    if (!measureCallbacks.current.has(index)) {
      let currentElement: HTMLElement | null = null;
      measureCallbacks.current.set(index, (el: HTMLElement | null) => {
        if (el === currentElement) return;
        if (currentElement) {
          itemObserver.current?.unobserve(currentElement);
          measuredIndices.current.delete(currentElement);
        }
        currentElement = el;
        if (!el) {
          measuredElements.current.delete(index);
          measureCallbacks.current.delete(index);
          return;
        }
        measuredElements.current.set(index, el);
        if (typeof ResizeObserver !== 'undefined') {
          // One observer measures the entire batch after layout and invalidates the
          // offsets once, even when several images finish loading together.
          itemObserver.current ??= new ResizeObserver((entries) => {
            let changed = false;
            for (const entry of entries) {
              const index = measuredIndices.current.get(entry.target);
              if (index === undefined) continue;
              const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
              if (updateHeight(index, height)) changed = true;
            }
            if (changed) setMeasureVersion((v) => v + 1);
          });
          measuredIndices.current.set(el, index);
          itemObserver.current.observe(el, { box: 'border-box' });
        } else if (updateHeight(index, el.getBoundingClientRect().height)) {
          setMeasureVersion((v) => v + 1);
        }
      });
    }
    return measureCallbacks.current.get(index)!;
  }, []);

  // Geometry changes with measurements, while scrolling only changes the window.
  const { starts, heights, totalHeight } = useMemo(() => {
    // The version is the reactive counterpart to the height cache held in a ref.
    void measureVersion;
    if (!enabled) return { starts: [], heights: [], totalHeight: 0 };

    const heights: number[] = [];
    const starts: number[] = [];
    let current = 0;
    for (let i = 0; i < itemCount; i++) {
      starts[i] = current;
      const h = itemHeights.current[i] ?? estimateSize;
      heights[i] = h;
      current += h + gap;
    }
    return { starts, heights, totalHeight: Math.max(0, current - gap) };
  }, [enabled, itemCount, estimateSize, gap, measureVersion]);

  const virtualItems = useMemo(() => {
    if (!enabled) {
      return Array.from({ length: itemCount }, (_, index) => ({
        index,
        start: 0,
        end: 0,
        key: String(index),
      }));
    }

    // Find visible range
    const startOffset = scrollOffset;
    const endOffset = scrollOffset + containerHeight;

    // No matching row means the viewport is below the list. Start after the
    // last row so overscan stays bounded instead of mounting the entire list.
    let startIndex = itemCount;
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
        endIndex = mid - 1;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    startIndex = Math.max(0, startIndex - overscan);
    endIndex = Math.min(itemCount - 1, endIndex + overscan);

    const items: VirtualItem[] = [];
    const indices = new Set<number>();
    // A section can contain hundreds of rows. Count-based overscan alone can
    // start rendering its image groups screens before they are needed.
    const overscanDistance = Math.min(overscan * estimateSize, containerHeight);
    for (let i = startIndex; i <= endIndex; i++) {
      if (
        starts[i] <= endOffset + overscanDistance &&
        starts[i] + heights[i] >= startOffset - overscanDistance
      ) {
        indices.add(i);
      }
    }
    for (const index of pinnedIndices ?? []) {
      if (index >= 0 && index < itemCount) indices.add(index);
    }
    for (const i of [...indices].sort((a, b) => a - b)) {
      items.push({
        index: i,
        start: starts[i],
        end: starts[i] + heights[i],
        key: String(i),
      });
    }

    return items;
  }, [
    enabled,
    itemCount,
    starts,
    heights,
    overscan,
    scrollOffset,
    containerHeight,
    pinnedIndices,
    estimateSize,
  ]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = containerRef.current;
      if (!el) return;
      let offset = 0;
      for (let i = 0; i < index; i++) {
        offset += (itemHeights.current[i] ?? estimateSize) + gap;
      }
      const top = el.getBoundingClientRect().top;
      const root = scrollParent(el);
      if (root instanceof HTMLElement) {
        const relativeTop = top - root.getBoundingClientRect().top;
        root.scrollTo({ top: root.scrollTop + relativeTop + offset, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: top + window.scrollY + offset, behavior: 'smooth' });
      }
    },
    [estimateSize, gap],
  );

  return { totalHeight, virtualItems, measureRef, containerRef, scrollToIndex };
}
