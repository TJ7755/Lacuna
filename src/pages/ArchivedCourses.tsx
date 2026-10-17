import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
import { updateCourse } from '../db/courseRepository';
import { useCourses } from '../state/useCourseData';
import { Button } from '../components/ui/Button';
import { SECTION_CARD_SURFACE_CLASS } from '../components/ui/SectionCard';
import { useToast } from '../components/ui/Toast';
import {
  markFinalExamHandled,
  readHandledFinalExam,
  restoreHandledFinalExam,
} from '../state/finalExamLifecycle';

export function ArchivedCourses() {
  const courses = useCourses();
  const { notify } = useToast();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const restoreButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusReturn = useRef<{
    courseId: string;
    index: number;
    trigger: HTMLButtonElement;
  } | null>(null);
  const archived = useMemo(
    () => courses?.filter((course) => course.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [courses],
  );

  useLayoutEffect(() => {
    const pending = focusReturn.current;
    if (!pending || !archived || archived.some((course) => course.id === pending.courseId)) return;
    focusReturn.current = null;
    // An async restore must not steal focus from another action chosen meanwhile.
    const active = document.activeElement;
    if (active !== pending.trigger && active !== document.body && active !== null) return;
    const next = archived[Math.min(pending.index, archived.length - 1)];
    const target = next ? restoreButtons.current[next.id] : heading.current;
    target?.focus({ preventScroll: true });
  }, [archived]);

  return (
    <div className={`${PAGE_FRAME} pb-10 pt-6 md:pt-8`}>
      <header className="mb-8">
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-display text-4xl font-semibold tracking-tight focus-visible:shadow-none md:text-[44px]"
        >
          Archived
        </h1>
      </header>

      {archived === undefined ? null : archived.length === 0 ? (
        // The shared card surface, as every page's empty state is, rather than a ruled line.
        <div className={`${SECTION_CARD_SURFACE_CLASS} px-6 py-12 text-center`}>
          <h2 className="font-display text-2xl">No archived courses</h2>
          <p className="mt-3 text-sm text-ink-soft">
            Courses you archive from Today wait here, ready to restore.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-ink/[0.06] px-4 text-sm font-semibold text-ink transition-colors hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          >
            Back to Today
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {archived.map((course, index) => (
            <li
              key={course.id}
              className={`${SECTION_CARD_SURFACE_CLASS} group relative flex items-center justify-between gap-4 p-5 card-surface-control transition-colors hover:bg-surface-raised focus-within:ring-2 focus-within:ring-accent/25`}
            >
              <Link
                to={`/course/${course.id}`}
                aria-label={`Open ${course.name}`}
                className="absolute inset-0 rounded-3xl focus-visible:outline-none"
              />
              <div className="pointer-events-none relative min-w-0">
                <h2 className="truncate font-display text-xl">{course.name}</h2>
              </div>
              <Button
                ref={(button) => {
                  restoreButtons.current[course.id] = button;
                }}
                variant="secondary"
                size="sm"
                className="relative z-10"
                aria-label={`Unarchive ${course.name}`}
                onClick={(event) => {
                  focusReturn.current = {
                    courseId: course.id,
                    index,
                    trigger: event.currentTarget,
                  };
                  const previousHandledExam = readHandledFinalExam(course.id);
                  const passedFinalExam =
                    course.examDate !== undefined && course.examDate < Date.now();
                  if (passedFinalExam) markFinalExamHandled(course.id, course.examDate!);
                  void updateCourse(course.id, { archived: false })
                    // An action rather than a jump, so focus stays with the next restore.
                    .then(() =>
                      notify(`${course.name} restored`, 'positive', {
                        actionLabel: 'Open',
                        onAction: () => void navigate(`/course/${course.id}`),
                      }),
                    )
                    .catch(() => {
                      if (focusReturn.current?.courseId === course.id) focusReturn.current = null;
                      if (passedFinalExam) {
                        restoreHandledFinalExam(course.id, previousHandledExam);
                      }
                      notify(`Could not restore ${course.name}`, 'negative');
                    });
                }}
              >
                Unarchive
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
