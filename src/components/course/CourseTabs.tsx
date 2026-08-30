// Shared course-level tab navigation — Path, Cards, Questions, Analytics,
// Settings — rendered on all five course surfaces so any section is one
// click from any other. Active tab is derived from the current route rather
// than passed in, so it never drifts out of sync with the URL. Styling
// reuses the segmented-pill vocabulary already established by
// LessonViewModeToggle (rounded-full border, bg-ink/5 track, active item on
// bg-surface with a soft shadow).

import { LayoutGroup, m as motion } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';
import { COURSE_SECTIONS } from './courseSections';

export function CourseTabs({ courseId }: { courseId: string }) {
  const { pathname } = useLocation();
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const base = `/course/${courseId}`;

  return (
    <nav
      aria-label="Course sections"
      // Hidden below sm, where CourseSectionBar carries these same sections within
      // thumb reach instead. max-w-full with scroll is the last resort at large font
      // scales: the bar slides rather than wrapping its labels inside their pills.
      className="hidden h-9 max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-ink/5 p-0.5 text-sm sm:inline-flex"
    >
      <LayoutGroup id={`course-tabs-${courseId}`}>
        {COURSE_SECTIONS.map(({ label, short, suffix }) => {
          const to = `${base}${suffix}`;
          // The Path tab (empty suffix) must match exactly so it doesn't stay
          // "active" while on /cards, /questions, /analytics or /settings (all of which
          // start with the same base path).
          const active =
            suffix === ''
              ? pathname === to || pathname.startsWith(`${to}/lesson/`)
              : pathname.startsWith(to);
          return (
            <Link
              key={label}
              to={to}
              aria-current={active ? 'page' : undefined}
              // The accessible name stays the full label at every width, so the shortened
              // mobile text is a visual abbreviation rather than a different control.
              aria-label={label}
              className={cn(
                'relative flex h-full items-center whitespace-nowrap rounded-full px-3 font-medium transition-colors',
                active ? 'text-ink' : 'text-ink-faint hover:text-ink',
              )}
            >
              {active && (
                <motion.span
                  layoutId="course-tab-active"
                  data-course-tab-indicator=""
                  aria-hidden="true"
                  transition={scaledSpring(multiplier, 400, 30)}
                  className="absolute inset-0 rounded-full bg-surface shadow-sm shadow-black/[0.04]"
                />
              )}
              <span className="relative z-10 sm:hidden">{short}</span>
              <span className="relative z-10 hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </LayoutGroup>
    </nav>
  );
}
