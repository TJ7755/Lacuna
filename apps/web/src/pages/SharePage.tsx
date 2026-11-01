import { buttonClassName } from '../components/ui/buttonStyles';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { ShareCourseContent } from '../components/share/ShareCourseContent';
import { gapsClassUrl, shareIdForCourse } from '../components/share/gapsClassUrl';
import { PageLoadingBoundary } from '../components/ui/PageLoadingBoundary';
import { Menu } from '../components/ui/Menu';
import { SectionCard } from '../components/ui/SectionCard';
import type { Course } from '@lacuna/core/db/types';
import { useCourses, useCourseSummaries } from '../state/useCourseData';
import { countOf } from '../utils/plural';

/**
 * The course a visit opens on, so sharing starts one tap from done: the course
 * asked for, else an active course already being shared, else the first active course.
 * Archived courses remain available when requested or when none are active.
 */
export function defaultShareCourse(
  courses: Course[],
  requested: string | null,
): Course | undefined {
  return (
    courses.find((course) => course.id === requested) ??
    courses.find((course) => !course.archived && course.distribution?.shareId) ??
    courses.find((course) => !course.archived) ??
    courses.find((course) => course.distribution?.shareId) ??
    courses[0]
  );
}

/** Share one course: a link by default, with a file, code, QR code or text as alternatives. */
export function SharePage() {
  const courses = useCourses();
  const summaries = useCourseSummaries();
  const [searchParams] = useSearchParams();
  const [chosenId, setChosenId] = useState<string | null>(() => searchParams.get('courseId'));
  const course = courses ? defaultShareCourse(courses, chosenId) : undefined;

  return (
    <div className={`${PAGE_FRAME} pb-12`}>
      <header className={PAGE_HEADER}>
        <h1 className={PAGE_TITLE}>Share</h1>
        <a
          href={gapsClassUrl(course ? shareIdForCourse(course) : undefined)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClassName('secondary')}
        >
          Class insights
        </a>
        {course && courses && courses.length > 1 && (
          <Menu
            label="Course to share"
            chevron
            size="md"
            className="max-w-full"
            items={courses.map((candidate) => {
              const summary = summaries?.[candidate.id];
              return {
                label: `${candidate.name}${candidate.archived ? ' · Archived' : ''}`,
                description: `${countOf(summary?.lessonCount ?? 0, 'lesson')} · ${countOf(summary?.cardCount ?? 0, 'card')}`,
                onSelect: () => setChosenId(candidate.id),
              };
            })}
          >
            <span className="inline-flex min-w-0 max-w-[min(28rem,calc(100vw-9rem))] items-center gap-2">
              <span className="truncate">{course.name}</span>
              {course.archived && <span className="shrink-0 text-ink-soft"> · Archived</span>}
            </span>
          </Menu>
        )}
        {course && courses?.length === 1 && (
          <p className="flex min-w-0 max-w-full items-center gap-2 text-lg text-ink-soft">
            <span className="truncate">{course.name}</span>
            {course.archived && <span className="shrink-0"> · Archived</span>}
          </p>
        )}
      </header>

      <PageLoadingBoundary pending={!courses}>
        {!courses ? null : !course ? (
          <SectionCard className="flex flex-col items-start gap-4">
            <h2 className="font-display text-2xl tracking-tight">Nothing to share yet</h2>
            <Link to="/" className={buttonClassName('primary')}>
              Create a course on Today
            </Link>
          </SectionCard>
        ) : (
          <ShareCourseContent
            course={course}
            highlight={searchParams.get('highlight') === 'share-link'}
          />
        )}
      </PageLoadingBoundary>
    </div>
  );
}
