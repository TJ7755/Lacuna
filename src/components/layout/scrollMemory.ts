import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** Where each page was left, keyed by path and query so a filtered list keeps its own place. */
const positions = new Map<string, number>();

/** Router state that marks a navigation as a return to a page the learner was already on. */
export interface ReturningState {
  returning?: boolean;
}

export function scrollKey(location: { pathname: string; search: string }): string {
  return `${location.pathname}${location.search}`;
}

/** How long a return keeps trying to reach its old position while lazy content loads. */
const RESTORE_WINDOW_MS = 1200;

/**
 * Remember the scroll container's position for every page, and put it back when the
 * learner returns, by the browser's Back or Forward or by an in-app return that sets
 * `returning`. Any other new page starts at the top; a query change on the same page
 * (a filter, a search) keeps its place.
 */
export function useScrollMemory(containerRef: RefObject<HTMLElement | null>): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const key = scrollKey(location);
  const keyRef = useRef(key);
  const pathRef = useRef(location.pathname);
  const restoringUntil = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const remember = () => {
      if (performance.now() < restoringUntil.current) return;
      positions.set(keyRef.current, container.scrollTop);
    };
    container.addEventListener('scroll', remember, { passive: true });
    return () => container.removeEventListener('scroll', remember);
  }, [containerRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const samePage = pathRef.current === location.pathname;
    keyRef.current = key;
    pathRef.current = location.pathname;
    if (!container) return;
    const returning =
      navigationType === 'POP' || (location.state as ReturningState | null)?.returning === true;
    if (!returning) {
      if (!samePage) container.scrollTo({ top: 0 });
      return;
    }
    const target = positions.get(key) ?? 0;
    const deadline = performance.now() + RESTORE_WINDOW_MS;
    restoringUntil.current = deadline;
    let frame = 0;
    const settle = () => {
      container.scrollTo({ top: target });
      // A lazy page may not be tall enough yet; keep trying until it is or time runs out.
      if (Math.abs(container.scrollTop - target) > 1 && performance.now() < deadline) {
        frame = requestAnimationFrame(settle);
      } else {
        restoringUntil.current = 0;
      }
    };
    settle();
    return () => {
      cancelAnimationFrame(frame);
      restoringUntil.current = 0;
    };
    // The location key changes on every navigation, including returns to the same URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
}

/** Test seam: forget every remembered position. */
export function clearScrollMemory(): void {
  positions.clear();
}
