import {
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

/**
 * Shared pointer-drag helper for the method page's interactive SVG charts.
 * Converts client X positions into viewBox units and reports them while the
 * pointer is captured. Keyboard stepping stays with each chart, since step
 * sizes differ per control.
 */
export function useDragX(
  svgRef: RefObject<SVGSVGElement | null>,
  viewW: number,
  onX: (x: number) => void,
) {
  const [dragging, setDragging] = useState(false);

  const apply = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      onX(((clientX - rect.left) / rect.width) * viewW);
    },
    [svgRef, viewW, onX],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      apply(e.clientX);
    },
    [apply],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      apply(e.clientX);
    },
    [apply],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<SVGElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  return {
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
