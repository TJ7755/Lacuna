import { useMemo } from 'react';
import { updateCourse } from '../db/repository';
import { useCourses } from '../state/useCourseData';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { ArchiveIcon } from '../components/ui/icons';
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
      <header className="mb-8 rounded-2xl border border-line bg-surface p-6 md:p-8">
        <div className="mb-2 flex items-center gap-2 text-accent">
          <ArchiveIcon width={18} height={18} />
          <span className="text-xs uppercase tracking-[0.18em]">Course library</span>
        </div>
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
              className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5"
            >
              <div className="min-w-0">
                <h2 className="truncate font-display text-xl">{course.name}</h2>
                <p className="mt-1 text-xs text-ink-faint">Review history preserved</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
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
