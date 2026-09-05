import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateCourse } from '../../db/repository';
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
      if (
        course.archived ||
        course.examDate === undefined ||
        course.examDate <= currentTime
      ) {
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
      if (!finalExamNeedsDecision(course, now) || attemptedArchives.current.has(attemptKey)) continue;
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

  if (!pending) return null;

  return (
    <FinalExamDecisionDialog
      course={pending}
      onArchive={() => {
        void updateCourse(pending.id, { archived: true })
          .then(() => notify(`${pending.name} archived`, 'positive'))
          .catch(() => notify(`Could not archive ${pending.name}`, 'negative'));
      }}
      onSetNewDate={() => {
        sessionSuppressed.current.add(`${pending.id}:${pending.examDate}`);
        navigate(`/course/${pending.id}/settings?editFinalExam=1`);
        refresh();
      }}
      onKeepRevising={() => {
        markFinalExamHandled(pending.id, pending.examDate!);
        refresh();
        notify(`${pending.name} will stay in active revision`, 'neutral');
      }}
    />
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
  const dialogRef = useFocusTrap(true, { autoFocusSelector: '[data-primary-action]' });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="final-exam-decision-title"
        className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Final exam passed</p>
        <h2 id="final-exam-decision-title" className="mt-2 font-display text-3xl tracking-tight">
          What should happen to {course.name}?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Archive it to remove it from active study, set another final exam, or keep revising on a
          rolling maintenance schedule.
        </p>
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
      </div>
    </div>
  );
}
