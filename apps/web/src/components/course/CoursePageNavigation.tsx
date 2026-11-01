import type { ReactNode } from 'react';
import { AppLink as Link } from '../ui/AppLink';
import { ChevronLeftIcon, LockIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { ArchivedCourseBadge } from './ArchivedCourseState';
import { CourseTabs } from './CourseTabs';
import type { CourseRecord } from '../../db/types';
import { updateCourse } from '../../db/courseRepository';
import { canEditLessons, resolveLessonViewMode } from '../../course/lessonViewMode';
import { LessonViewModeToggle } from './LessonViewModeToggle';
import { useToast } from '../ui/Toast';

const AUTHORING_LOCKED = 'Authoring is locked for shared courses';

interface CoursePageNavigationProps {
  courseId: string;
  course?: CourseRecord;
  backTo: string;
  backLabel: string;
  archived?: boolean;
  trailing?: ReactNode;
  /** Show the course name in place of the back link. */
  identity?: { name: string; back?: boolean };
  /** Hide the identity while the page's own title already names the course. */
  identityHidden?: boolean;
  className?: string;
}

/**
 * Stable course-level chrome. The equal outer grid tracks keep the section
 * tabs centred independently of the back-link and page-specific trailing
 * controls, so navigation does not move between course surfaces.
 */
export function CoursePageNavigation({
  courseId,
  course,
  backTo,
  backLabel,
  archived = false,
  trailing,
  identity,
  identityHidden = false,
  className,
}: CoursePageNavigationProps) {
  const { notify } = useToast();
  const controls =
    trailing ??
    (course && !archived && !course.archived ? (
      canEditLessons(course) ? (
        <LessonViewModeToggle
          mode={resolveLessonViewMode(course)}
          onChange={(mode) => {
            void updateCourse(course.id, { lessonViewMode: mode }).catch(() => {
              notify('Could not save workspace mode. Try again.', 'negative');
            });
          }}
        />
      ) : (
        <Link
          to={`/course/${course.id}/settings`}
          aria-label={AUTHORING_LOCKED}
          title={AUTHORING_LOCKED}
          className="hidden size-11 place-items-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink sm:grid"
        >
          <LockIcon width={18} height={18} />
        </Link>
      )
    ) : undefined);
  return (
    <div
      data-course-page-navigation=""
      className={cn(
        // Sticks to the top while the course scrolls beneath a frosted band, so the
        // sections stay in one place on every course surface.
        'sticky top-0 z-20 -mx-3 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl bg-paper/85 px-3 py-1.5 backdrop-blur-md sm:grid ',
        identity && !archived
          ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,max-content)_minmax(0,1fr)]'
          : 'sm:grid-cols-[minmax(min-content,1fr)_minmax(0,max-content)_minmax(min-content,1fr)]',
        className,
      )}
    >
      {identity && !archived ? (
        <Link
          to={`/course/${courseId}`}
          aria-hidden={identityHidden || undefined}
          tabIndex={identityHidden ? -1 : undefined}
          className={cn(
            'inline-flex min-h-11 min-w-0 max-w-full shrink items-center gap-2.5 justify-self-start font-bold max-sm:flex-1 font-display text-ink',
            identityHidden && 'pointer-events-none invisible',
          )}
        >
          {identity.back && <ChevronLeftIcon width={16} height={16} className="shrink-0" />}
          <span data-course-nav-title="" className="truncate">
            {identity.name}
          </span>
        </Link>
      ) : (
        <Link
          to={backTo}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 justify-self-start text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
        >
          <ChevronLeftIcon width={16} height={16} />
          {backLabel}
        </Link>
      )}

      <div className="min-w-0 max-w-full justify-self-center">
        {archived ? <ArchivedCourseBadge /> : <CourseTabs courseId={courseId} />}
      </div>

      {controls === undefined ? (
        <span aria-hidden="true" className="hidden sm:block" />
      ) : (
        <div className="min-w-0 justify-self-end">{controls}</div>
      )}
    </div>
  );
}
