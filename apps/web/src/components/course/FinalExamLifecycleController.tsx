import { AnimatePresence, useIsPresent } from 'motion/react';
import { DialogPanel } from '../ui/DialogPanel';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateCourse } from '../../db/courseRepository';
import type { Course } from '../../db/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  finalExamNeedsDecision,
  markFinalExamHandled,
  useAfterFinalExamPolicy,
} from '../../state/finalExamLifecycle';
import { useSidebarData } from '../../state/useCourseData';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';

export function FinalExamLifecycleController() {
  const sharedCourses = useSidebarData()?.courses;
  const courses = useMemo(
    () => sharedCourses?.slice().sort((a, b) => a.createdAt - b.createdAt),
    [sharedCourses],
  );
  const [policy] = useAfterFinalExamPolicy();
  const { notify } = useToast();
  const navigate = useNavigate();
  const attemptedArchives = useRef(new Set<string>());
  const sessionSuppressed = useRef(new Set<string>());
  const [wakeRevision, refresh] = useReducer((version: number) => version + 1, 0);
  const now = Date.now();

  useEffect(() => {
    if (!courses) return;
    const currentTime = Date.now();
    const nearest = courses.reduce<number | undefined>((current, course) => {
      if (course.archived || course.examDate === undefined || course.examDate <= currentTime) {
        return current;
      }
      return current === undefined || course.examDate < current ? course.examDate : current;
    }, undefined);
    if (nearest === undefined) return;
    const delay = Math.min(Math.max(nearest - currentTime + 1, 1), 2_147_483_647);
    const timer = window.setTimeout(refresh, delay);
    return () => window.clearTimeout(timer);
  }, [courses, wakeRevision]);

  useEffect(() => {
    if (!courses || policy !== 'archive') return;
    for (const course of courses) {
      const attemptKey = `${course.id}:${course.examDate}`;
      if (!finalExamNeedsDecision(course, now) || attemptedArchives.current.has(attemptKey))
        continue;
      attemptedArchives.current.add(attemptKey);
      void updateCourse(course.id, { archived: true }).catch(() => {
        notify(`Could not archive ${course.name}`, 'negative');
      });
    }
  }, [courses, notify, now, policy]);

  const pending =
    policy === 'ask'
      ? courses?.find(
          (course) =>
            finalExamNeedsDecision(course, now) &&
            !sessionSuppressed.current.has(`${course.id}:${course.examDate}`),
        )
      : undefined;

  return (
    <AnimatePresence>
      {pending && (
        <FinalExamDecisionDialog
          key={`${pending.id}:${pending.examDate}`}
          course={pending}
          onArchive={() => {
            void updateCourse(pending.id, { archived: true })
              .then(() => notify(`${pending.name} archived`, 'positive'))
              .catch(() => notify(`Could not archive ${pending.name}`, 'negative'));
          }}
          onSetNewDate={() => {
            sessionSuppressed.current.add(`${pending.id}:${pending.examDate}`);
            void navigate(`/course/${pending.id}/settings?editFinalExam=1`);
            refresh();
          }}
          onKeepRevising={() => {
            markFinalExamHandled(pending.id, pending.examDate!);
            refresh();
            notify(`${pending.name} will stay in active revision`, 'neutral');
          }}
        />
      )}
    </AnimatePresence>
  );
}

function FinalExamDecisionDialog({
  course,
  onArchive,
  onSetNewDate,
  onKeepRevising,
}: {
  course: Course;
  onArchive: () => void;
  onSetNewDate: () => void;
  onKeepRevising: () => void;
}) {
  const present = useIsPresent();
  const dialogRef = useFocusTrap(present, { autoFocusSelector: '[data-primary-action]' });

  return (
    <DialogPanel
      trapRef={dialogRef}
      label="Final exam passed"
      onKeyDown={() => {}}
      className="max-w-lg overflow-y-auto p-6"
    >
      <h2 id="final-exam-decision-title" className="font-display text-xl tracking-tight">
        Final exam passed
      </h2>
      <p className="mt-2 text-ink-soft">What should happen to {course.name} now?</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="ghost" onClick={onKeepRevising}>
          Keep revising
        </Button>
        <Button variant="secondary" onClick={onSetNewDate}>
          Set a new exam date
        </Button>
        <Button data-primary-action variant="primary" onClick={onArchive}>
          Archive course
        </Button>
      </div>
    </DialogPanel>
  );
}
