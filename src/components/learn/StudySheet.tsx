import { ModalBackdrop } from '../ui/ModalBackdrop';
// The study decision as a sheet rather than a full-screen route: a bottom sheet on a
// phone, whose handle swipes it away, and the shared centred dialogue on wider screens.
//
// It used to be a page: tapping Study committed you to a screen that cost two taps to
// leave, so an accidental tap was expensive and the decision did not feel reversible.
// As a sheet it obeys the rule that if a thing is one tap to enter it is one tap to
// leave — tap the backdrop, press Escape, or choose Done.
//
// Opened from the course page's Study button already scoped to that course, and from
// Review today with no course, in which case it asks which course first. Picker and
// course options share one sheet: the chrome stays put and the step crossfades.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { m as motion } from 'motion/react';
import { useCourse, useCourses } from '../../state/useCourseData';
import { useCourseStudyFlow } from '../../state/useCourseStudyFlow';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { DialogPanel } from '../ui/DialogPanel';
import { Button } from '../ui/Button';
import { StepSwap } from '../ui/StepSwap';
import { ArrowRightIcon, ChevronLeftIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { planStudySession } from '../../course/studySessionPlan';
import { SimpleLearnOptions } from './SimpleLearnOptions';

export function StudySheet({
  courseId,
  otherWays = true,
  onClose,
}: {
  /** Null opens the sheet at the course picker; a course opens it at that course's options. */
  courseId: string | null;
  /** False when the opener already offers Other ways beside its Study button. */
  otherWays?: boolean;
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
            otherWays={otherWays}
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

/** How far the handle must travel down before letting go closes the sheet. */
const DISMISS_DISTANCE = 80;
const LABEL = 'Choose what to study';

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const wide = useMediaQuery('(min-width: 768px)');
  const trapRef = useFocusTrap(true);
  if (wide) {
    return (
      <DialogPanel
        label={LABEL}
        trapRef={trapRef}
        // Escape is handled by StudySheet for both forms.
        onKeyDown={() => undefined}
        onBackdropClick={onClose}
        className="max-h-[85vh] max-w-2xl overflow-y-auto px-8 pb-7 pt-8"
      >
        {children}
      </DialogPanel>
    );
  }
  return (
    <PhoneSheet trapRef={trapRef} onClose={onClose}>
      {children}
    </PhoneSheet>
  );
}

function PhoneSheet({
  children,
  trapRef,
  onClose,
}: {
  children: React.ReactNode;
  trapRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);
  // The sheet follows the finger down from its handle; far enough closes it, otherwise
  // it settles back.
  const start = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const release = (clientY: number) => {
    if (start.current === null) return;
    const distance = clientY - start.current;
    start.current = null;
    if (distance >= DISMISS_DISTANCE) onClose();
    else setOffset(0);
  };

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
      aria-label={LABEL}
      onClick={onClose}
    >
      <ModalBackdrop shade={30} />
      <motion.div
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ duration: 0.28 * m, ease: [0.16, 1, 0.3, 1] }}
        style={{ bottom: -offset }}
        className={cn(
          'absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-t-3xl bg-surface pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_-20px_hsl(var(--ink)/0.35)]',
          start.current === null && 'transition-[bottom] duration-200 ease-out',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {/* A tall, full-width strip, so the handle is easy to catch with a thumb. */}
        <div
          data-testid="study-sheet-handle"
          aria-hidden="true"
          className="-mx-6 flex h-8 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          onPointerDown={(event) => {
            start.current = event.clientY;
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (start.current !== null) setOffset(Math.max(0, event.clientY - start.current));
          }}
          onPointerUp={(event) => release(event.clientY)}
          onPointerCancel={() => {
            start.current = null;
            setOffset(0);
          }}
        >
          <div className="h-1.5 w-12 rounded-full bg-ink/15" />
        </div>
        <div className="mx-auto max-w-xl pt-2">{children}</div>
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
          There are no courses to study yet. Create one from Today first.
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
  otherWays,
  onBack,
  onClose,
}: {
  courseId: string;
  otherWays: boolean;
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
  const assessments = decision?.kind === 'choice' ? decision.assessments : [];
  const plan = flow ? planStudySession(flow) : undefined;
  const canReviewDueCards =
    snapshot !== undefined && snapshot.recurringPracticeEligibleCount > 0 && !plan?.startsWithDueReview;
  return (
    <>
      {onBack && <AllCoursesButton onClick={onBack} />}
      <div className="flex items-baseline justify-between gap-3">
        <SheetTitle>{title ?? '\u00a0'}</SheetTitle>
        {plan?.totalMinutes !== undefined && (
          <span className="shrink-0 text-sm text-ink-soft tabular-nums">
            About {plan.totalMinutes} min
          </span>
        )}
      </div>
      {flow === undefined ? (
        <p className="py-2 text-sm text-ink-faint">Working out what is next…</p>
      ) : plan && plan.steps.length > 0 ? (
        <>
          <ol
            aria-label="Today's session"
            className="overflow-hidden rounded-2xl border border-line"
          >
            {plan.steps.map((step, index) => (
              <li
                key={step.key}
                className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums',
                    index === 0 ? 'bg-accent text-accent-fg' : 'bg-ink/5 text-ink-soft',
                  )}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink [overflow-wrap:anywhere]">{step.title}</p>
                  {step.detail && <p className="text-sm text-ink-soft">{step.detail}</p>}
                </div>
                {step.minutes !== undefined && (
                  <span className="shrink-0 text-sm text-ink-soft tabular-nums">
                    {step.minutes} min
                  </span>
                )}
              </li>
            ))}
          </ol>
          <Button
            variant="primary"
            size="lg"
            onClick={() => start(plan.startsWithDueReview ? '?review=due' : '')}
          >
            Start session
            <ArrowRightIcon width={18} height={18} aria-hidden="true" />
          </Button>
        </>
      ) : (
        <p className="py-1 text-sm text-ink-soft">
          {flow.decision.kind === 'empty'
            ? 'This course has no cards yet.'
            : flow.decision.kind === 'blocked'
              ? 'The next lesson is locked until earlier work is complete.'
              : 'Everything here is finished for now.'}
        </p>
      )}

      {otherWays && (canReviewDueCards || assessments.length > 0 || (course && !course.archived)) && (
        <section aria-label="Other ways" className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
          <h3 className="text-sm font-semibold text-ink-soft">Other ways</h3>
          {canReviewDueCards && (
            <Button variant="secondary" onClick={() => start('?review=due')}>
              Only review due cards
              <span className="ml-1 text-sm opacity-70 tabular-nums">
                {snapshot?.recurringPracticeEligibleCount}
              </span>
            </Button>
          )}
          {assessments.map((assessment) => (
            <Button
              key={assessment.assessmentId}
              variant="secondary"
              onClick={() => start(`?assessmentId=${encodeURIComponent(assessment.assessmentId)}`)}
            >
              Revise for {assessment.name}
            </Button>
          ))}
          {course && !course.archived && (
            // The section's own rule already separates it from the plan.
            <SimpleLearnOptions courseId={courseId} className="border-t-0 pt-0" />
          )}
        </section>
      )}

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
