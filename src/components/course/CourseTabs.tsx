// Shared course-level tab navigation — Path, Question bank, Analytics,
// Settings — rendered on all four course surfaces so any section is one
// click from any other. Active tab is derived from the current route rather
// than passed in, so it never drifts out of sync with the URL. Styling
// reuses the segmented-pill vocabulary already established by
// LessonViewModeToggle (rounded-full border, bg-ink/5 track, active item on
// bg-surface with a soft shadow).

import { Link, useLocation } from 'react-router-dom';
import { cn } from '../ui/cn';

interface CourseTab {
  label: string;
  /** Shown below sm, where the full set of labels cannot fit on one line. */
  short: string;
  suffix: string;
}

const COURSE_TABS: CourseTab[] = [
  { label: 'Path', short: 'Path', suffix: '' },
  { label: 'Question bank', short: 'Bank', suffix: '/bank' },
  { label: 'Analytics', short: 'Analytics', suffix: '/analytics' },
  { label: 'Settings', short: 'Settings', suffix: '/settings' },
];

export function CourseTabs({ courseId }: { courseId: string }) {
  const { pathname } = useLocation();
  const base = `/course/${courseId}`;

  return (
    <nav
      aria-label="Course sections"
      // max-w-full with scroll is the last resort at very small widths or large font
      // scales: the bar slides rather than wrapping its labels inside their pills.
      className="inline-flex h-9 max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-ink/5 p-0.5 text-sm"
    >
      {COURSE_TABS.map(({ label, short, suffix }) => {
        const to = `${base}${suffix}`;
        // The Path tab (empty suffix) must match exactly so it doesn't stay
        // "active" while on /bank, /analytics or /settings (all of which
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
              'flex h-full items-center whitespace-nowrap rounded-full px-3 font-medium transition-colors',
              active ? 'bg-surface text-ink shadow-sm shadow-black/[0.04]' : 'text-ink-faint hover:text-ink',
            )}
          >
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
