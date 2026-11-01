import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const STORAGE_KEY = 'lacuna-ai-window-position';
const VIEWPORT_MARGIN = 8;

export interface WindowPosition {
  left: number;
  top: number;
}

function readStoredPosition(): WindowPosition | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WindowPosition>;
    return typeof parsed.left === 'number' && typeof parsed.top === 'number'
      ? { left: parsed.left, top: parsed.top }
      : null;
  } catch {
    return null;
  }
}

function storePosition(position: WindowPosition) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Remembering the position is a convenience; the window works without it.
  }
}

/** Keep a window of the given size fully inside the viewport. */
export function clampPosition(
  position: WindowPosition,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): WindowPosition {
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - size.width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - size.height - VIEWPORT_MARGIN);
  return {
    left: Math.min(Math.max(position.left, VIEWPORT_MARGIN), maxLeft),
    top: Math.min(Math.max(position.top, VIEWPORT_MARGIN), maxTop),
  };
}

/**
 * Pointer-driven dragging for a fixed-position window. Until the user first drags it,
 * `position` is null and the caller anchors the window with CSS (bottom-right); after
 * that it is an absolute left/top, clamped to the viewport and kept for the session.
 */
export function useDraggableWindow(active: boolean, layoutKey: unknown) {
  const windowRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<WindowPosition | null>(readStoredPosition);
  const [dragging, setDragging] = useState(false);
  const grabRef = useRef<{ dx: number; dy: number } | null>(null);
  const latestRef = useRef<WindowPosition | null>(position);

  const clampToViewport = useCallback((next: WindowPosition) => {
    const rect = windowRef.current?.getBoundingClientRect();
    return clampPosition(
      next,
      { width: rect?.width ?? 0, height: rect?.height ?? 0 },
      { width: window.innerWidth, height: window.innerHeight },
    );
  }, []);

  // Re-clamp when the viewport or the window's own height changes (minimise/expand).
  useEffect(() => {
    if (!active) return;
    const reclamp = () => {
      setPosition((current) => {
        if (!current) return current;
        const next = clampToViewport(current);
        latestRef.current = next;
        return next.left === current.left && next.top === current.top ? current : next;
      });
    };
    reclamp();
    window.addEventListener('resize', reclamp);
    return () => window.removeEventListener('resize', reclamp);
  }, [active, layoutKey, clampToViewport]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    const rect = windowRef.current?.getBoundingClientRect();
    if (!rect) return;
    grabRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const grab = grabRef.current;
      if (!grab) return;
      const next = clampToViewport({
        left: event.clientX - grab.dx,
        top: event.clientY - grab.dy,
      });
      latestRef.current = next;
      setPosition(next);
    },
    [clampToViewport],
  );

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!grabRef.current) return;
    grabRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
    if (latestRef.current) storePosition(latestRef.current);
  }, []);

  return {
    windowRef,
    position,
    dragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
