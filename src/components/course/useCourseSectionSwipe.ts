import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { courseSectionPath, matchCourseSection } from './courseSections';

/** Horizontal travel before a drag counts as a section change rather than a stray movement. */
const COMMIT_PX = 64;

/** A drag must be this much more horizontal than vertical to beat scrolling. */
const DIRECTION_RATIO = 1.4;

/**
 * Swipe left or right to move between a course's sections, matching the tab order.
 *
 * The gesture is claimed only once movement is clearly horizontal, so vertical
 * scrolling always wins a close call: the page is far more often scrolled than
 * switched. It is inert outside an exact course-section route, so deeper pages and the
 * rest of the app keep ordinary behaviour. Tapping the tabs remains the primary way to
 * switch; this is an accelerator, which is why nothing depends on discovering it.
 */
export function useCourseSectionSwipe(): {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  /** -1 when moving to an earlier section, 1 to a later one, 0 for any other navigation. */
  sectionDirection: number;
} {
  const location = useLocation();
  const navigate = useNavigate();
  const drag = useRef<{ x: number; y: number; active: boolean; claimed: boolean }>({
    x: 0,
    y: 0,
    active: false,
    claimed: false,
  });
  const previousPathname = useRef(location.pathname);

  const sectionDirection = useMemo(() => {
    const from = matchCourseSection(previousPathname.current);
    const to = matchCourseSection(location.pathname);
    previousPathname.current = location.pathname;
    if (!from || !to || from.courseId !== to.courseId || from.index === to.index) return 0;
    return to.index > from.index ? 1 : -1;
  }, [location.pathname]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    // Mouse drags select text; only touch and pen should switch sections.
    if (event.pointerType === 'mouse') return;
    drag.current = { x: event.clientX, y: event.clientY, active: true, claimed: false };
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!drag.current.active || drag.current.claimed) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (Math.abs(dy) * DIRECTION_RATIO > Math.abs(dx)) {
      // Reading this as a scroll; do not reconsider for the rest of the gesture.
      drag.current.active = false;
      return;
    }
    if (Math.abs(dx) > COMMIT_PX) drag.current.claimed = true;
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const { active, claimed, x } = drag.current;
      drag.current.active = false;
      drag.current.claimed = false;
      if (!active || !claimed) return;
      const current = matchCourseSection(location.pathname);
      if (!current) return;
      const forward = event.clientX < x;
      const target = courseSectionPath(current.courseId, current.index + (forward ? 1 : -1));
      if (target) navigate(target);
    },
    [location.pathname, navigate],
  );

  return { onPointerDown, onPointerMove, onPointerUp, sectionDirection };
}
