// The course's sections, pinned within thumb reach on a phone. This is the mobile
// counterpart of CourseTabs, which takes over from sm upwards.
//
// A bar carries course sections rather than app-level destinations because a tab bar
// is a peer switcher: every item must be a sibling view that is instantly reachable and
// instantly reversible. The five sections satisfy that and are switched many times in a
// session; app destinations are neither peers of one another in the same sense nor
// visited nearly as often, so they stay in the sidebar behind the hamburger.
//
// Absent outside a course, and absent from Learn mode, which lives outside the shell
// and pins its own grading controls to the bottom of the screen.

import { NavLink, useLocation } from 'react-router-dom';
import { prefetchRoute } from '../../routes/prefetch';
import { CardsIcon, ChartIcon, FileTextIcon, PathIcon, SettingsIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { COURSE_SECTIONS, courseIdFromPath } from './courseSections';

/** Indexed by section, so it stays aligned with COURSE_SECTIONS rather than duplicating it. */
const SECTION_ICONS = [PathIcon, CardsIcon, FileTextIcon, ChartIcon, SettingsIcon];

export function CourseSectionBar() {
  const { pathname } = useLocation();
  const courseId = courseIdFromPath(pathname);
  if (!courseId) return null;

  return (
    <nav
      aria-label="Course sections"
      // Opaque rather than translucent: content scrolling under a blurred bar competes
      // with the icons for legibility.
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:hidden"
    >
      <ul className="flex items-stretch">
        {COURSE_SECTIONS.map(({ label, short, suffix }, index) => {
          const Icon = SECTION_ICONS[index];
          const to = `/course/${courseId}${suffix}`;
          return (
            <li key={label} className="flex flex-1">
              <NavLink
                to={to}
                // Exact matching for Path keeps the course root and its nested lesson
                // and editor routes from marking every sibling section current.
                end={suffix === ''}
                aria-label={label}
                onPointerEnter={() => prefetchRoute(to)}
                onPointerDown={() => prefetchRoute(to)}
                onFocus={() => prefetchRoute(to)}
                // Styling and aria-current both come from NavLink's own route match,
                // so the two can never disagree about which section is current.
                className={({ isActive }) =>
                  cn(
                    'flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors',
                    isActive ? 'text-accent' : 'text-ink-faint active:text-ink',
                  )
                }
              >
                <Icon width={22} height={22} />
                {short}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
