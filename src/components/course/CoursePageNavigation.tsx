import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeftIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { ArchivedCourseBadge } from './ArchivedCourseState';
import { CourseTabs } from './CourseTabs';

interface CoursePageNavigationProps {
  courseId: string;
  backTo: string;
  backLabel: string;
  archived?: boolean;
  trailing?: ReactNode;
  className?: string;
}

/**
 * Stable course-level chrome. The equal outer grid tracks keep the section
 * tabs centred independently of the back-link and page-specific trailing
 * controls, so navigation does not move between course surfaces.
 */
export function CoursePageNavigation({
  courseId,
  backTo,
  backLabel,
  archived = false,
  trailing,
  className,
}: CoursePageNavigationProps) {
  return (
    <div
      data-course-page-navigation=""
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
        className,
      )}
    >
      <Link
        to={backTo}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 justify-self-start text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
      >
        <ChevronLeftIcon width={16} height={16} />
        {backLabel}
      </Link>

      <div className="min-w-0 justify-self-center">
        {archived ? <ArchivedCourseBadge /> : <CourseTabs courseId={courseId} />}
      </div>

      {trailing === undefined ? (
        <span aria-hidden="true" className="hidden sm:block" />
      ) : (
        <div className="min-w-0 justify-self-end">{trailing}</div>
      )}
    </div>
  );
}
