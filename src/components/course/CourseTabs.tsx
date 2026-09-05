// Shared course-level tab navigation — Path, Cards, Questions, Analytics,
// Settings — rendered on all five course surfaces so any section is one
// click from any other. Active tab is derived from the current route rather
// than passed in, so it never drifts out of sync with the URL. Styling
// reuses the segmented-control styling already established by
// LessonViewModeToggle (rounded-lg border, bg-ink/5 track, active item on
// bg-surface with a soft shadow).

import { LayoutGroup, m as motion } from 'motion/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { prefetchRoute } from '../../routes/prefetch';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';
import { useCourseTabSlider } from './useCourseTabSlider';
import { COURSE_SECTIONS } from './courseSections';

export function CourseTabs({ courseId }: { courseId: string }) {
  const { pathname } = useLocation();
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const base = `/course/${courseId}`;
  const navigate = useNavigate();
  const slider = useCourseTabSlider(
    (index) => navigate(`${base}${COURSE_SECTIONS[index].suffix}`),
    multiplier,
  );

  return (
    <motion.nav
      initial={false}
      animate={slider.pressed && multiplier > 0 ? 'pressed' : 'resting'}
      aria-label="Course sections"
      {...slider.handlers}
      // Hidden below sm, where CourseSectionBar carries these same sections within
      // thumb reach instead. max-w-full with scroll is the last resort at large font
      // scales: the bar slides rather than wrapping its labels inside their tabs.
      className="hidden h-9 touch-pan-y select-none max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-ink/5 p-0.5 text-sm sm:inline-flex"
    >
      <LayoutGroup id={`course-tabs-${courseId}`}>
        {COURSE_SECTIONS.map(({ label, short, suffix }, index) => {
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
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              aria-current={active ? 'page' : undefined}
              // The accessible name stays the full label at every width, so the shortened
              // mobile text is a visual abbreviation rather than a different control.
              aria-label={label}
              onPointerEnter={() => prefetchRoute(to)}
              onPointerDown={() => prefetchRoute(to)}
              onFocus={() => prefetchRoute(to)}
              onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                const next =
                  event.key === 'ArrowRight'
                    ? Math.min(index + 1, COURSE_SECTIONS.length - 1)
                    : event.key === 'ArrowLeft'
                      ? Math.max(index - 1, 0)
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? COURSE_SECTIONS.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                event.currentTarget.closest('nav')?.querySelectorAll('a')[next]?.focus();
                navigate(`${base}${COURSE_SECTIONS[next].suffix}`);
              }}
              className={cn(
                'relative flex h-full items-center whitespace-nowrap rounded-lg px-3 font-medium transition-colors',
                active ? 'text-ink' : 'text-ink-faint hover:text-ink',
              )}
            >
              {active && (
                <motion.span
                  layoutId="course-tab-active"
                  style={{ x: slider.x, pointerEvents: 'none' }}
                  variants={{ resting: { scale: 1 }, pressed: { scale: 1.06 } }}
                  data-course-tab-indicator=""
                  aria-hidden="true"
                  transition={scaledSpring(multiplier, 320, 28)}
                  className="absolute inset-0 rounded-lg bg-surface shadow-sm shadow-black/[0.04]"
                />
              )}
              <span className="relative z-10 sm:hidden">{short}</span>
              <span className="relative z-10 hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </LayoutGroup>
    </motion.nav>
  );
}
