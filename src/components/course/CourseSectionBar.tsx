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
import { CardsIcon, ChartIcon, FileTextIcon, PathIcon, SettingsIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { activeCourseSectionIndex, COURSE_SECTIONS, courseIdFromPath } from './courseSections';

/** Indexed by section, so it stays aligned with COURSE_SECTIONS rather than duplicating it. */
const SECTION_ICONS = [PathIcon, CardsIcon, FileTextIcon, ChartIcon, SettingsIcon];

export function CourseSectionBar() {
  const { pathname } = useLocation();
  const courseId = courseIdFromPath(pathname);
  if (!courseId) return null;

  const activeIndex = activeCourseSectionIndex(pathname, courseId);

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
          return (
            <li key={label} className="flex flex-1">
              <NavLink
                to={`/course/${courseId}${suffix}`}
                aria-label={label}
                aria-current={index === activeIndex ? 'page' : undefined}
                className={cn(
                  'flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors',
                  index === activeIndex ? 'text-accent' : 'text-ink-faint active:text-ink',
                )}
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
