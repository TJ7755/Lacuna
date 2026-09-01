import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { updateCourse } from '../db/repository';
import { useCourses } from '../state/useCourseData';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import {
  markFinalExamHandled,
  readHandledFinalExam,
  restoreHandledFinalExam,
} from '../state/finalExamLifecycle';

export function ArchivedCourses() {
  const courses = useCourses();
  const { notify } = useToast();
  const archived = useMemo(
    () => courses?.filter((course) => course.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [courses],
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
      <header className="mb-8 rounded-2xl border border-line bg-surface p-7 md:p-9">
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">Archived</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Finished courses stay here with their review history intact, outside active study and
          workload forecasts.
        </p>
      </header>

      {archived === undefined ? null : archived.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <h2 className="font-display text-2xl">No archived courses</h2>
          <p className="mt-2 text-sm text-ink-soft">Courses you archive will appear here.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {archived.map((course) => (
            <li
              key={course.id}
              className="group relative flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-sm focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/25"
            >
              <Link
                to={`/course/${course.id}`}
                aria-label={`Open ${course.name}`}
                className="absolute inset-0 rounded-2xl focus-visible:outline-none"
              />
              <div className="pointer-events-none relative min-w-0">
                <h2 className="truncate font-display text-xl">{course.name}</h2>
                <p className="mt-1 text-xs text-ink-faint">Review history preserved</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="relative z-10"
                aria-label={`Unarchive ${course.name}`}
                onClick={() => {
                  const previousHandledExam = readHandledFinalExam(course.id);
                  const passedFinalExam =
                    course.examDate !== undefined && course.examDate < Date.now();
                  if (passedFinalExam) markFinalExamHandled(course.id, course.examDate!);
                  void updateCourse(course.id, { archived: false })
                    .then(() => notify(`${course.name} restored`, 'positive'))
                    .catch(() => {
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
