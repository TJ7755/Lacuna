import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeftIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { ArchivedCourseBadge } from './ArchivedCourseState';
import { CourseTabs } from './CourseTabs';
import type { CourseRecord } from '../../db/types';
import { updateCourse } from '../../db/courseRepository';
import { canEditLessons, resolveLessonViewMode } from '../../course/lessonViewMode';
import { LessonViewModeToggle } from './LessonViewModeToggle';

interface CoursePageNavigationProps {
  courseId: string;
  course?: CourseRecord;
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
  course,
  backTo,
  backLabel,
  archived = false,
  trailing,
  className,
}: CoursePageNavigationProps) {
  const controls =
    trailing ??
    (course && !archived && !course.archived ? (
      canEditLessons(course) ? (
        <LessonViewModeToggle
          mode={resolveLessonViewMode(course)}
          onChange={(mode) => void updateCourse(course.id, { lessonViewMode: mode })}
        />
      ) : (
        <span className="hidden text-xs text-ink-faint sm:inline">
          Authoring is locked for shared courses
        </span>
      )
    ) : undefined);
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

      {controls === undefined ? (
        <span aria-hidden="true" className="hidden sm:block" />
      ) : (
        <div className="min-w-0 justify-self-end">{controls}</div>
      )}
    </div>
  );
}
