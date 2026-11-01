import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { CourseTitleTransition } from '../course/CourseTitleTransition';
import { CourseSectionNavigation } from '../course/CourseSectionNavigation';
import { matchCourseSection } from '../course/courseSections';

const COURSE_CHROME_ROUTE = /^\/course\/([^/]+)\/(?:analytics|lesson\/[^/]+)$/;

/** How far a course tab drifts as it fades in: a nudge that says which way, not a full slide. */
export const TAB_DRIFT_PX = 24;

/**
 * Ordinary destinations fade in over a page that leaves at once, so two pages never
 * overlap. Adjacent course tabs also drift a little in the direction of travel. Both
 * settle with no transform left behind, so fixed descendants stay viewport-bound.
 */
export const ROUTE_VARIANTS = {
  enter: (direction: number) =>
    direction === 0 ? { opacity: 0 } : { opacity: 0, x: TAB_DRIFT_PX * direction },
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({
    opacity: 0,
    x: -TAB_DRIFT_PX * direction * 0.5,
    transition: { duration: 0 },
  }),
};

export function RouteTransitions({
  pathname,
  direction,
  multiplier,
  children,
}: {
  pathname: string;
  direction: number;
  multiplier: number;
  children: ReactNode;
}) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  const section = matchCourseSection(pathname);
  // Lessons keep the same chrome during loading; they remain deeper destinations, not tabs.
  const barCourseId = section?.courseId ?? COURSE_CHROME_ROUTE.exec(pathname)?.[1];
  return (
    <>
      {barCourseId && (
        <CourseSectionNavigation key={barCourseId} courseId={barCourseId} pathname={pathname} />
      )}
      {barCourseId && (
        <CourseTitleTransition
          key={`title-${barCourseId}`}
          courseId={barCourseId}
          pathname={pathname}
          multiplier={multiplier}
        />
      )}
      {/* The persistent chrome stays outside this clipped viewport. The departing page
          leaves at once, so popLayout never shows two pages at the same time.
          AnimatePresence supplies the latest direction to the departing page too. */}
      <div className={section ? 'relative overflow-x-clip' : 'relative min-h-full'}>
        <AnimatePresence custom={direction} mode="popLayout">
          <RoutePage
            key={pathname}
            pathname={pathname}
            direction={direction}
            multiplier={multiplier}
            entering={mounted.current}
          >
            {children}
          </RoutePage>
        </AnimatePresence>
      </div>
    </>
  );
}

const RoutePage = forwardRef<
  HTMLDivElement,
  {
    pathname: string;
    direction: number;
    multiplier: number;
    entering: boolean;
    children: ReactNode;
  }
>(function RoutePage({ pathname, direction, multiplier, entering, children }, ref) {
  const present = useIsPresent();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const assignRef = useCallback(
    (node: HTMLDivElement | null) => {
      pageRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    if (present) {
      page.removeAttribute('aria-hidden');
      return;
    }
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && page.contains(focused)) focused.blur();
    page.setAttribute('aria-hidden', 'true');
  }, [present]);

  return (
    <motion.div
      ref={assignRef}
      inert={!present}
      data-route-content={pathname}
      custom={direction}
      variants={ROUTE_VARIANTS}
      initial={multiplier > 0 && entering ? 'enter' : 'center'}
      animate={multiplier > 0 ? 'center' : undefined}
      exit={multiplier > 0 ? 'exit' : undefined}
      transition={{
        duration: (direction === 0 ? 0.16 : 0.22) * multiplier,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="min-h-full w-full"
    >
      {children}
    </motion.div>
  );
});
