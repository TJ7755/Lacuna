import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { OtherShareWays } from '../components/share/OtherShareWays';
import { ShareLinkPanel } from '../components/share/ShareLinkPanel';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { FadeInView } from '../components/ui/FadeInView';
import { Menu } from '../components/ui/Menu';
import { SectionCard } from '../components/ui/SectionCard';
import { Skeleton } from '../components/ui/Skeleton';
import type { Course } from '../db/types';
import { useCourseCards, useCourses, useCourseSummaries } from '../state/useCourseData';
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
  const cards = useCourseCards(course?.id);

  return (
    // Shares the page frame's left edge but keeps a narrower reading column.
    <div className={`${PAGE_FRAME} py-10 [&>*]:max-w-3xl`}>
      {/* Top-aligned, so the course picker beside it never pushes the title down. */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-[44px]">Share</h1>
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
            <span className="truncate">{course.name}</span>
          </Menu>
        )}
        {course && courses?.length === 1 && (
          <p className="truncate text-lg text-ink-soft">{course.name}</p>
        )}
      </header>

      {!courses ? (
        <DelayedFallback>
          <ShareSkeleton />
        </DelayedFallback>
      ) : !course ? (
        <SectionCard className="flex flex-col items-start gap-4">
          <h2 className="font-display text-2xl tracking-tight">Nothing to share yet</h2>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Create a course on Today
          </Link>
        </SectionCard>
      ) : (
        <FadeInView key={course.id} y={0}>
          <ShareLinkPanel
            course={course}
            highlight={searchParams.get('highlight') === 'share-link'}
          />
          <OtherShareWays course={course} cards={cards} />
        </FadeInView>
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
