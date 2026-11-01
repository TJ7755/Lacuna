import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

export interface PopoverPosition {
  top: number;
  left: number;
}

const POPOVER_GAP = 8;
const VIEWPORT_PADDING = 16;
const DEFAULT_POPOVER_WIDTH = 320;
const DEFAULT_POPOVER_HEIGHT = 480;

/** Keep a portalled popover anchored to its trigger and inside the viewport. */
export function useAnchoredPopoverPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
) {
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const compute = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect();
      const popoverWidth = popoverRect?.width || DEFAULT_POPOVER_WIDTH;
      const popoverHeight = popoverRect?.height || DEFAULT_POPOVER_HEIGHT;
      const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_PADDING;
      const spaceAbove = triggerRect.top - VIEWPORT_PADDING;
      const nextPlacement =
        spaceBelow >= popoverHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';
      const unclampedTop =
        nextPlacement === 'bottom'
          ? triggerRect.bottom + POPOVER_GAP
          : triggerRect.top - POPOVER_GAP - popoverHeight;
      const maxTop = Math.max(
        VIEWPORT_PADDING,
        window.innerHeight - VIEWPORT_PADDING - popoverHeight,
      );
      const maxLeft = Math.max(
        VIEWPORT_PADDING,
        window.innerWidth - VIEWPORT_PADDING - popoverWidth,
      );
      const nextPosition = {
        top: Math.min(Math.max(unclampedTop, VIEWPORT_PADDING), maxTop),
        left: Math.min(Math.max(triggerRect.left, VIEWPORT_PADDING), maxLeft),
      };

      setPlacement(nextPlacement);
      setPosition((current) =>
        current?.top === nextPosition.top && current.left === nextPosition.left
          ? current
          : nextPosition,
      );
    };

    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, { capture: true, passive: true });
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(compute);
    resizeObserver?.observe(triggerRef.current);
    if (popoverRef.current) resizeObserver?.observe(popoverRef.current);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
      resizeObserver?.disconnect();
    };
  }, [open, popoverRef, triggerRef]);

  const resetPosition = useCallback(() => setPosition(null), []);
  return { placement, position, resetPosition };
}
