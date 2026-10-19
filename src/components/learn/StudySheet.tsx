import { useEffect, useId, useState } from 'react';
import { prefetchRoute } from '../../routes/prefetch';
import { useNavigate } from 'react-router-dom';
import { useCourse, useCourses } from '../../state/useCourseData';
import { useCourseStudyFlow } from '../../state/useCourseStudyFlow';
import { StudyExpansion, useStudyLaunch } from './StudyExpansion';
import { Button } from '../ui/Button';
import { StepSwap } from '../ui/StepSwap';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { ArrowRightIcon, ChevronDownIcon, ChevronLeftIcon } from '../ui/icons';
import { planStudySession } from '../../course/studySessionPlan';
import { canEditLessons } from '../../course/lessonViewMode';
import { lessonEffectiveReleaseDates } from '../../course/path';
import { lockHintFor } from '../course/lockHint';

export function StudySheet({
  courseId,
  anchor,
  otherWays = true,
  onClose,
}: {
  /** Null opens the preview at the course picker; a course opens it at that course's options. */
  courseId: string | null;
  anchor: HTMLElement;
  /** False when the opener already offers Other ways beside its Study button. */
  otherWays?: boolean;
  onClose: () => void;
}) {
  // Chosen within the preview when it opened without a course.
  const [pickedCourseId, setPickedCourseId] = useState<string | null>(courseId);
  const [stepDirection, setStepDirection] = useState(0);
  const scopedCourseId = courseId ?? pickedCourseId;

  return (
    <StudyExpansion anchor={anchor} onClose={onClose}>
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
          />
        ) : (
          <CoursePicker
            onPick={(id) => {
              setStepDirection(1);
              setPickedCourseId(id);
            }}
          />
        )}
      </StepSwap>
    </StudyExpansion>
  );
}

function CoursePicker({ onPick }: { onPick: (courseId: string) => void }) {
  const courses = useCourses();
  const active = courses?.filter((course) => !course.archived);

  return (
    <>
      <PreviewTitle>Which course?</PreviewTitle>
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
    </>
  );
}

function CourseStudyOptions({
  courseId,
  otherWays,
  onBack,
}: {
  courseId: string;
  otherWays: boolean;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    prefetchRoute(`/course/${courseId}/study`);
  }, [courseId]);
  const launch = useStudyLaunch();
  const course = useCourse(courseId);
  const flow = useCourseStudyFlow(courseId);
  const title = flow?.course.name ?? course?.name;
  const [showOtherWays, setShowOtherWays] = useState(false);
  const otherWaysId = useId();

  // The choice is encoded in the URL rather than handed over in memory, so the study
  // flow starts already knowing what it is running and never shows an entry of its own.
  const start = (search: string) => launch(() => navigate(`/course/${courseId}/study${search}`));

  if (flow === null) {
    return (
      <>
        {onBack && <AllCoursesButton onClick={onBack} />}
        <PreviewTitle>Course not found</PreviewTitle>
      </>
    );
  }

  const decision = flow?.decision;
  const snapshot = flow?.snapshot;
  const assessments = decision?.kind === 'choice' ? decision.assessments : [];
  const plan = flow ? planStudySession(flow) : undefined;
  const canReviewDueCards =
    snapshot !== undefined &&
    snapshot.recurringPracticeEligibleCount > 0 &&
    !plan?.startsWithDueReview;
  const canPractiseForExam = (snapshot?.examPracticeEligibleCount ?? 0) > 0;
  return (
    <>
      {onBack && <AllCoursesButton onClick={onBack} />}
      <div className="mb-2 flex flex-col gap-1">
        <PreviewTitle>{title ?? '\u00a0'}</PreviewTitle>
        {plan?.totalMinutes !== undefined && (
          <span className="shrink-0 text-sm text-ink-soft tabular-nums">
            About {plan.totalMinutes} min
          </span>
        )}
      </div>
      {flow === undefined ? (
        <p className="py-2 text-sm text-ink-faint">Working out what is next…</p>
      ) : plan && plan.steps.length > 0 ? (
        <ol aria-label="Today's session" className="flex list-none flex-col gap-4 py-1">
          {plan.steps.map((step) => (
            <li key={step.key} className="min-w-0">
              <p className="font-medium leading-snug text-ink [overflow-wrap:anywhere]">
                {step.title}
              </p>
              {step.detail && <p className="mt-0.5 text-sm text-ink-soft">{step.detail}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <NothingToStudy flow={flow} onAddCards={() => navigate(`/course/${courseId}/cards/new`)} />
      )}

      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {canPractiseForExam && (
          <Button variant="secondary" onClick={() => start('?review=exam')}>
            Practise for exam
            <span className="ml-1 text-sm opacity-70 tabular-nums">
              {snapshot?.examPracticeEligibleCount}
            </span>
          </Button>
        )}
        {otherWays && (canReviewDueCards || assessments.length > 0) && (
          <Button
            variant="ghost"
            className="mr-auto"
            aria-expanded={showOtherWays}
            aria-controls={otherWaysId}
            onClick={() => setShowOtherWays((value) => !value)}
          >
            Other ways
            <ChevronDownIcon width={14} height={14} aria-hidden="true" />
          </Button>
        )}
        {plan && plan.steps.length > 0 && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => start(plan.startsWithDueReview ? '?review=due' : '')}
          >
            Start session
            <ArrowRightIcon width={18} height={18} aria-hidden="true" />
          </Button>
        )}
      </div>

      {otherWays && (canReviewDueCards || assessments.length > 0) && (
        <AnimatedDisclosure open={showOtherWays}>
          <section id={otherWaysId} aria-label="Other ways" className="flex flex-col gap-1">
            {canReviewDueCards && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => start('?review=due')}
              >
                Only review due cards
                <span className="ml-1 text-sm opacity-70 tabular-nums">
                  {snapshot?.recurringPracticeEligibleCount}
                </span>
              </Button>
            )}
            {assessments.map((assessment) => (
              <Button
                key={assessment.assessmentId}
                variant="ghost"
                className="justify-start"
                onClick={() =>
                  start(`?assessmentId=${encodeURIComponent(assessment.assessmentId)}`)
                }
              >
                Revise for {assessment.name}
              </Button>
            ))}
          </section>
        </AnimatedDisclosure>
      )}
    </>
  );
}

/**
 * Why there is no session, naming the actual blocker, with the authoring route when
 * the course has nothing in it and the reader may add to it.
 */
function NothingToStudy({
  flow,
  onAddCards,
}: {
  flow: NonNullable<ReturnType<typeof useCourseStudyFlow>>;
  onAddCards: () => void;
}) {
  const { decision, course, snapshot } = flow;
  if (decision.kind === 'empty') {
    return (
      <>
        <p className="py-1 text-sm text-ink-soft">This course has no cards yet.</p>
        {canEditLessons(course) && (
          <Button variant="primary" size="lg" onClick={onAddCards}>
            Add cards
          </Button>
        )}
      </>
    );
  }
  if (decision.kind === 'blocked') {
    if (decision.reason === 'archived') {
      return (
        <p className="py-1 text-sm text-ink-soft">This course is archived. Restore it to study.</p>
      );
    }
    const lessons = snapshot.nodes.flatMap((node) => (node.nodeType === 'lesson' ? [node] : []));
    const next = lessons.find((node) => node.status === 'locked');
    const hint =
      next &&
      lockHintFor(
        course,
        next.id,
        lessonEffectiveReleaseDates(
          course,
          lessons.map((node) => node.lesson),
        ),
      );
    return (
      <p className="py-1 text-sm text-ink-soft">
        {next ? (
          <>
            <span className="font-semibold text-ink [overflow-wrap:anywhere]">
              {next.lesson.name}
            </span>
            {` is locked. ${hint ?? 'It unlocks once earlier work is complete'}.`}
          </>
        ) : (
          'The next lesson is locked until earlier work is complete.'
        )}
      </p>
    );
  }
  return <p className="py-1 text-sm text-ink-soft">Nothing is due right now.</p>;
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

function PreviewTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      tabIndex={-1}
      className="font-display text-2xl tracking-tight outline-none [overflow-wrap:anywhere]"
    >
      {children}
    </h2>
  );
}
