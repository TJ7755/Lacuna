import { forwardRef, useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, m as motion, useIsPresent } from 'motion/react';
import { CourseSectionNavigation } from '../course/CourseSectionNavigation';
import { matchCourseSection } from '../course/courseSections';

/** Ordinary destinations fade without transforms so fixed descendants stay viewport-bound. */
const ROUTE_VARIANTS = {
  enter: (direction: number) =>
    direction === 0 ? { opacity: 0 } : { opacity: 1, transform: `translateX(${100 * direction}%)` },
  center: (direction: number) =>
    direction === 0 ? { opacity: 1 } : { opacity: 1, transform: 'translateX(0%)' },
  exit: (direction: number) =>
    direction === 0
      ? { opacity: 0 }
      : { opacity: 1, transform: `translateX(${-100 * direction}%)` },
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
  const section = matchCourseSection(pathname);
  return (
    <>
      {section && <CourseSectionNavigation key={section.courseId} courseId={section.courseId} />}
      {/* The persistent chrome stays outside this clipped viewport. popLayout lets
          outgoing and incoming pages travel together without stacking their heights.
          AnimatePresence supplies the latest direction to the departing page too. */}
      <div className={section ? 'relative overflow-x-clip' : 'relative min-h-full'}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <RoutePage
            key={pathname}
            pathname={pathname}
            direction={direction}
            multiplier={multiplier}
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
    children: ReactNode;
  }
>(function RoutePage({ pathname, direction, multiplier, children }, ref) {
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
      initial={multiplier > 0 ? 'enter' : false}
      animate={multiplier > 0 ? 'center' : undefined}
      exit={multiplier > 0 ? 'exit' : undefined}
      transition={{
        duration: (direction === 0 ? 0.18 : 0.3) * multiplier,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="min-h-full w-full"
    >
      {children}
    </motion.div>
  );
});
