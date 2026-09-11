import type { ReactNode } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
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
          <motion.div
            key={pathname}
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
        </AnimatePresence>
      </div>
    </>
  );
}
