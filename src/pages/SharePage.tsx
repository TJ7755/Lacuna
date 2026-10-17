import { buttonClassName } from '../components/ui/buttonStyles';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { ShareCourseContent } from '../components/share/ShareCourseContent';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { Menu } from '../components/ui/Menu';
import { SectionCard } from '../components/ui/SectionCard';
import { Skeleton } from '../components/ui/Skeleton';
import type { Course } from '../db/types';
import { useCourses, useCourseSummaries } from '../state/useCourseData';
import { countOf } from '../utils/plural';

/**
 * The course a visit opens on, so sharing starts one tap from done: the course
 * asked for, else one already being shared, else the first active course.
 */
export function defaultShareCourse(
  courses: Course[],
  requested: string | null,
): Course | undefined {
  return (
    courses.find((course) => course.id === requested) ??
    courses.find((course) => course.distribution?.shareId) ??
    courses.find((course) => !course.archived) ??
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
        {course && courses && courses.length > 1 && (
          <Menu
            label="Course to share"
            chevron
            size="md"
            className="max-w-full"
            items={courses.map((candidate) => {
              const summary = summaries?.[candidate.id];
              return {
                label: candidate.name,
                description: `${countOf(summary?.lessonCount ?? 0, 'lesson')} · ${countOf(summary?.cardCount ?? 0, 'card')}`,
                onSelect: () => setChosenId(candidate.id),
              };
            })}
          >
            <span className="max-w-[min(28rem,calc(100vw-9rem))] truncate">{course.name}</span>
          </Menu>
        )}
        {course && courses?.length === 1 && (
          <p className="max-w-full truncate text-lg text-ink-soft">{course.name}</p>
        )}
      </header>

      {!courses ? (
        <DelayedFallback>
          <ShareSkeleton />
        </DelayedFallback>
      ) : !course ? (
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
    </div>
  );
}

function ShareSkeleton() {
  return (
    <SectionCard className="space-y-4" aria-hidden>
      <Skeleton className="h-7 w-40 rounded bg-ink/10" />
      <Skeleton className="h-12 w-56 rounded-full bg-ink/10" />
    </SectionCard>
  );
}
