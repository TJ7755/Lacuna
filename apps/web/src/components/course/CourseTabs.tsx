// Shared course-level tab navigation — Path, Cards, Questions, Progress, Settings —
// rendered on every course surface so any section is one click from any
// other. Active tab is derived from the current route rather than passed in,
// so it never drifts out of sync with the URL. Styling matches the compact
// PillToggleGroup used by LessonViewModeToggle beside it (a 44px pill track
// on bg-ink/[0.06], the active item on bg-surface with a soft shadow).

import { m as motion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppLink as Link } from '../ui/AppLink';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { prefetchRoute } from '../../routes/prefetch';
import { cn } from '../ui/cn';
import { scaledSpring } from '../ui/motion';
import { useCourseTabSlider } from './useCourseTabSlider';
import { COURSE_SECTIONS, isCourseSectionCurrent } from './courseSections';

export function CourseTabs({ courseId }: { courseId: string }) {
  const { pathname, key } = useLocation();
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const base = `/course/${courseId}`;
  const navigate = useNavigate();
  const activeIndex = COURSE_SECTIONS.findIndex(({ suffix }) =>
    isCourseSectionCurrent(pathname, courseId, suffix),
  );
  const slider = useCourseTabSlider(
    activeIndex,
    key,
    (index) => navigate(`${base}${COURSE_SECTIONS[index].suffix}`),
    multiplier,
  );

  return (
    <nav
      ref={slider.track}
      aria-label="Course sections"
      {...slider.handlers}
      // Hidden below sm, where CourseSectionBar carries these same sections within
      // thumb reach instead. max-w-full with scroll is the last resort at large font
      // scales: the bar slides rather than wrapping its labels inside their tabs.
      className="relative hidden h-11 touch-pan-y select-none max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-full bg-ink/[0.06] p-1 text-sm sm:inline-flex"
    >
      {activeIndex >= 0 && (
        <motion.span
          initial={false}
          animate={{ scale: slider.pressed && multiplier > 0 ? 1.06 : 1 }}
          style={{ x: slider.x, width: slider.width }}
          data-course-tab-indicator=""
          aria-hidden="true"
          transition={scaledSpring(multiplier, 320, 36)}
          className="pointer-events-none absolute inset-y-1 left-0 -translate-x-1/2 rounded-full bg-surface shadow-[0_1px_2px_hsl(var(--ink)/0.08)]"
        />
      )}
      {COURSE_SECTIONS.map(({ label, short, suffix }, index) => {
        const to = `${base}${suffix}`;
        const active = index === activeIndex;
        return (
          <Link
            key={label}
            to={to}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            // The held indicator is this control's own press feedback.
            data-press=""
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
              void navigate(`${base}${COURSE_SECTIONS[next].suffix}`);
            }}
            className={cn(
              // The pseudo-element lifts the 36px pill to a 44px target, as PillToggleGroup's sm size does.
              "relative flex h-full items-center whitespace-nowrap rounded-full px-4 font-semibold transition-colors before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']",
              active ? 'text-ink' : 'text-ink-soft hover:text-ink',
            )}
          >
            <span className="relative z-10 sm:hidden">{short}</span>
            <span className="relative z-10 hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
