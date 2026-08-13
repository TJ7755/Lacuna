// The study decision as a bottom sheet rather than a full-screen route.
//
// It used to be a page: tapping Study committed you to a screen that cost two taps to
// leave, so an accidental tap was expensive and the decision did not feel reversible.
// As a sheet it obeys the rule that if a thing is one tap to enter it is one tap to
// leave — tap the backdrop, press Escape, or choose Done.
//
// Opened from the course page's Study button already scoped to that course, and from
// Review today with no course, in which case it asks which course first. Picker and
// course options share one sheet: the chrome stays put and the step crossfades.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useCourse, useCourses } from '../../state/useCourseData';
import { useCourseStudyFlow } from '../../state/useCourseStudyFlow';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { StepSwap } from '../ui/StepSwap';
import { ChevronLeftIcon } from '../ui/icons';

export function StudySheet({
  courseId,
  onClose,
}: {
  /** Null opens the sheet at the course picker; a course opens it at that course's options. */
  courseId: string | null;
  onClose: () => void;
}) {
  // Chosen within the sheet when it opened without a course.
  const [pickedCourseId, setPickedCourseId] = useState<string | null>(courseId);
  const [stepDirection, setStepDirection] = useState(0);
  const scopedCourseId = courseId ?? pickedCourseId;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Sheet onClose={onClose}>
      <StepSwap
        stepKey={scopedCourseId ?? 'picker'}
        direction={courseId === null ? stepDirection : 0}
        className="flex flex-col gap-3"
        moveFocus
      >
        {scopedCourseId ? (
          <CourseStudyOptions
            courseId={scopedCourseId}
            onBack={
              courseId === null
                ? () => {
                    setStepDirection(-1);
                    setPickedCourseId(null);
                  }
                : undefined
            }
            onClose={onClose}
          />
        ) : (
          <CoursePicker
            onPick={(id) => {
              setStepDirection(1);
              setPickedCourseId(id);
            }}
            onClose={onClose}
          />
        )}
      </StepSwap>
    </Sheet>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  const trapRef = useFocusTrap(true);

  return (
    <motion.div
      ref={trapRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 * m }}
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Choose what to study"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ duration: 0.28 * m, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-t-3xl border-t border-line-strong bg-surface px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl shadow-black/20"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-ink/15" aria-hidden="true" />
        <div className="mx-auto max-w-xl">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function CoursePicker({
  onPick,
  onClose,
}: {
  onPick: (courseId: string) => void;
  onClose: () => void;
}) {
  const courses = useCourses();
  const active = courses?.filter((course) => !course.archived);

  return (
    <>
      <SheetTitle>Which course?</SheetTitle>
      {active === undefined ? (
        <p className="py-2 text-sm text-ink-faint">Loading your courses…</p>
      ) : active.length === 0 ? (
        <p className="py-2 text-sm text-ink-soft">
          There are no courses to study yet. Create one from the dashboard first.
        </p>
      ) : (
        active.map((course) => (
          <Button
            key={course.id}
            variant="secondary"
            size="lg"
            className="justify-start"
            onClick={() => onPick(course.id)}
          >
            {course.name}
          </Button>
        ))
      )}
      <Button variant="ghost" size="lg" onClick={onClose}>
        Done
      </Button>
    </>
  );
}

function CourseStudyOptions({
  courseId,
  onBack,
  onClose,
}: {
  courseId: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const course = useCourse(courseId);
  const flow = useCourseStudyFlow(courseId);
  const title = flow?.course.name ?? course?.name;

  // The choice is encoded in the URL rather than handed over in memory, so the study
  // flow starts already knowing what it is running and never shows an entry of its own.
  const start = (search: string) => navigate(`/course/${courseId}/study${search}`);

  if (flow === null) {
    return (
      <>
        {onBack && <AllCoursesButton onClick={onBack} />}
        <SheetTitle>Course not found</SheetTitle>
        <Button variant="ghost" size="lg" onClick={onClose}>
          Done
        </Button>
      </>
    );
  }

  const decision = flow?.decision;
  const snapshot = flow?.snapshot;
  const nextStep = decision?.kind === 'step' || decision?.kind === 'choice' ? decision.step : null;
  const assessments = decision?.kind === 'choice' ? decision.assessments : [];
  const nextIsDueReview = nextStep?.kind === 'practice' && nextStep.mode === 'recurring';
  const canReviewDueCards =
    snapshot !== undefined && snapshot.recurringPracticeEligibleCount > 0 && !nextIsDueReview;

  return (
    <>
      {onBack && <AllCoursesButton onClick={onBack} />}
      <SheetTitle>{title ?? '\u00a0'}</SheetTitle>

      {flow === undefined ? (
        <p className="py-2 text-sm text-ink-faint">Working out what is next…</p>
      ) : nextStep ? (
        <Button
          variant="primary"
          size="lg"
          onClick={() => start(nextIsDueReview ? '?review=due' : '')}
        >
          {nextIsDueReview ? 'Review due cards' : `Continue: ${nextStep.label}`}
        </Button>
      ) : (
        <p className="py-1 text-sm text-ink-soft">
          {flow.decision.kind === 'empty'
            ? 'This course has no cards yet.'
            : flow.decision.kind === 'blocked'
              ? 'The next lesson is locked until earlier work is complete.'
              : 'Everything here is finished for now.'}
        </p>
      )}

      {canReviewDueCards && (
        <Button variant="secondary" size="lg" onClick={() => start('?review=due')}>
          Review due cards
          <span className="ml-2 text-sm opacity-70">{snapshot.recurringPracticeEligibleCount}</span>
        </Button>
      )}

      {assessments.map((assessment) => (
        <Button
          key={assessment.assessmentId}
          variant="secondary"
          size="lg"
          onClick={() => start(`?assessmentId=${encodeURIComponent(assessment.assessmentId)}`)}
        >
          Revise for {assessment.name}
        </Button>
      ))}

      <Button variant="ghost" size="lg" onClick={onClose}>
        Done
      </Button>
    </>
  );
}

function AllCoursesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mt-1 mb-1 inline-flex items-center gap-1.5 self-start text-sm text-ink-faint transition-colors hover:text-ink"
    >
      <ChevronLeftIcon width={16} height={16} />
      All courses
    </button>
  );
}

function SheetTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 tabIndex={-1} className="font-display text-2xl tracking-tight outline-none">
      {children}
    </h2>
  );
}
