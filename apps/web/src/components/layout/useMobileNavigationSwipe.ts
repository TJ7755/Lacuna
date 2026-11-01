import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export const MOBILE_NAVIGATION_QUERY = '(max-width: 767px)';

const EDGE_WIDTH_PX = 32;
const COMMIT_DISTANCE_PX = 56;
const DIRECTION_RATIO = 1.4;
const DIRECTION_SLOP_PX = 8;
const INTERACTIVE_TARGETS =
  'a, button, input, textarea, select, option, label, canvas, svg, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], [tabindex], [data-navigation-swipe-ignore]';

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
} | null;

/**
 * Opens the mobile navigation from a deliberate rightward swipe at the viewport's left edge.
 *
 * The gesture starts only on inert page content. It claims that narrow edge region at pointer-down
 * so nested horizontal gestures cannot also fire, but does not cancel the browser's default until
 * the movement is unambiguously horizontal. Vertical movement therefore remains ordinary scroll.
 */
export function useMobileNavigationSwipe({
  enabled,
  onOpen,
}: {
  enabled: boolean;
  onOpen: () => void;
}) {
  const gesture = useRef<Gesture>(null);

  useEffect(() => {
    document.documentElement.classList.add('lacuna-app-shell');
    return () => document.documentElement.classList.remove('lacuna-app-shell');
  }, []);

  const release = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may have cancelled or released it while deciding to scroll.
    }
  }, []);

  const reset = useCallback(
    (event?: ReactPointerEvent<HTMLElement>) => {
      if (event) release(event);
      gesture.current = null;
    },
    [release],
  );

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const target = event.target;
      if (
        !enabled ||
        event.pointerType !== 'touch' ||
        !window.matchMedia?.(MOBILE_NAVIGATION_QUERY).matches ||
        event.clientX < 0 ||
        event.clientX > EDGE_WIDTH_PX ||
        (target instanceof Element && target.closest(INTERACTIVE_TARGETS))
      ) {
        gesture.current = null;
        return;
      }

      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      gesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [enabled],
  );

  const onPointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;

      event.stopPropagation();
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;

      if (Math.abs(dx) < DIRECTION_SLOP_PX && Math.abs(dy) < DIRECTION_SLOP_PX) return;

      if (dx < 0 || Math.abs(dy) * DIRECTION_RATIO > dx) {
        reset(event);
        return;
      }

      if (dx < COMMIT_DISTANCE_PX) return;

      event.preventDefault();
      reset(event);
      onOpen();
    },
    [onOpen, reset],
  );

  const onPointerUpCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!gesture.current || gesture.current.pointerId !== event.pointerId) return;
      event.stopPropagation();
      reset(event);
    },
    [reset],
  );

  const onPointerCancelCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!gesture.current || gesture.current.pointerId !== event.pointerId) return;
      event.stopPropagation();
      reset(event);
    },
    [reset],
  );

  return {
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
    onPointerCancelCapture,
  };
}
