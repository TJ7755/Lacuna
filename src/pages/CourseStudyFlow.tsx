import { StudyExitHeader } from '../components/learn/StudyExitHeader';
import { useLeaveFlow } from '../utils/editorOrigin';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PomodoroProvider, usePomodoroFlowContext } from '../hooks/PomodoroContext';
import { useCourseStudyFlow } from '../state/useCourseStudyFlow';
import {
  clearActiveStudyFlow,
  readActiveStudyFlow,
  startActiveStudyFlow,
  touchActiveStudyFlow,
} from '../state/activeStudyFlow';
import {
  DUE_REVIEW_STEP,
  STUDY_REVIEW_BLOCK_SIZE,
  CATCH_UP_STEP,
  EXAM_PRACTICE_STEP,
  planNextStudyStep,
  type StudyFlowStep,
} from '../course/studyFlowPlanner';
import type {
  SessionSummary,
  StudyStepSummary,
  QuestionStudySummary,
} from '../course/sessionSummary';
import { StudyStepTransition } from '../components/learn/StudyStepTransition';
import { StudyFlowMessage } from '../components/learn/StudyFlowMessage';
import { StudyQuestionStep } from '../components/learn/StudyQuestionStep';
import { StepSwap } from '../components/ui/StepSwap';
import { continuesWithoutPause, mayContinueWithoutPause } from '../course/studyFlowContinuation';
import { LearnMode, type LearnSessionRequest } from './LearnMode';
const SpecificationStudyFlow = lazy(() =>
  import('./SpecificationStudyFlow').then((module) => ({
    default: module.SpecificationStudyFlow,
  })),
);

interface TransitionState {
  summary: StudyStepSummary;
  completedStep: StudyFlowStep;
}

export function CourseStudyFlow() {
  const { courseId } = useParams<{ courseId: string }>();
  const [params] = useSearchParams();
  const point = params.get('specificationPoint');
  return (
    <PomodoroProvider>
      {point !== null && courseId ? (
        <Suspense fallback={<PageLoading />}>
          <SpecificationStudyFlow
            key={`${courseId}:${point}:${params.get('assessmentId') ?? ''}`}
            courseId={courseId}
            pointId={point}
            assessmentId={params.get('assessmentId') ?? undefined}
          />
        </Suspense>
      ) : (
        <CourseStudyFlowInner />
      )}
    </PomodoroProvider>
  );
}

function identityFor(courseId: string) {
  const stored = readActiveStudyFlow();
  return stored?.courseId === courseId
    ? touchActiveStudyFlow(courseId)
    : startActiveStudyFlow(courseId);
}

function CourseStudyFlowInner() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams] = useSearchParams();
  const [flowIdentity, setFlowIdentity] = useState<ReturnType<typeof readActiveStudyFlow>>(() =>
    courseId ? identityFor(courseId) : null,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [previousStep, setPreviousStep] = useState<StudyFlowStep | null>(null);
  const [catchUpFinished, setCatchUpFinished] = useState(false);
  const entryAssessmentId = searchParams.get('assessmentId');
  const [currentStep, setCurrentStep] = useState<StudyFlowStep | null>(() => {
    if (searchParams.get('review') === 'earlier') return CATCH_UP_STEP;
    if (searchParams.get('review') === 'due') return DUE_REVIEW_STEP;
    if (searchParams.get('review') === 'exam') return EXAM_PRACTICE_STEP;
    return entryAssessmentId
      ? {
          kind: 'practice',
          nodeKey: `assessment-${entryAssessmentId}`,
          mode: 'assessment',
          assessmentId: entryAssessmentId,
          label: 'Assessment revision',
        }
      : null;
  });
  const entryPracticeNodeKey = searchParams.get('practiceNode');
  // The choice is made in the study sheet before this route is entered and arrives as a
  // query parameter, so the flow no longer presents an entry screen of its own.
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const plannedFlow = useCourseStudyFlow(
    courseId,
    refreshKey,
    currentStep === null || transition !== null,
    previousStep,
  );
  // Reaching a session objective need not empty the broader catch-up pool.
  const flow = useMemo(
    () =>
      plannedFlow && catchUpFinished
        ? { ...plannedFlow, decision: planNextStudyStep(plannedFlow.snapshot, false, previousStep) }
        : plannedFlow,
    [catchUpFinished, plannedFlow, previousStep],
  );
  const pomodoro = usePomodoroFlowContext();

  useEffect(() => {
    if (!courseId) return;
    setFlowIdentity(identityFor(courseId));
  }, [courseId]);

  // Leaving Study returns to whichever page opened it (see utils/editorOrigin.ts).
  const leaveFlow = useLeaveFlow(courseId ? `/course/${courseId}` : '/');
  const finishFlow = useCallback(() => {
    clearActiveStudyFlow();
    leaveFlow();
  }, [leaveFlow]);

  // The URL-seeded step is available on the first paint; the planner's next step
  // is not, because it arrives with `flow`. Derive it here rather than waiting
  // for the effect — otherwise the conductor renders "You are caught up" for a
  // frame and StepSwap turns that into a visible crossfade into Learn.
  const displayStep = useMemo<StudyFlowStep | null>(() => {
    if (currentStep) return currentStep;
    if (transition || !flow) return null;
    // A deep link may name the practice node to run; honour it while it is still active,
    // and otherwise fall through to whatever the planner says comes next.
    if (entryPracticeNodeKey) {
      const requestedPractice = flow.snapshot.practiceByKey.get(entryPracticeNodeKey);
      if (requestedPractice?.active) {
        return {
          kind: 'practice',
          nodeKey: requestedPractice.nodeKey,
          mode: 'curricular',
          label: requestedPractice.label,
        };
      }
    }
    // 'choice' means an assessment overlaps the next step. The sheet already offered
    // that alternative before entry, and choosing it arrives as ?assessmentId, so
    // reaching here means the curriculum branch was the one chosen.
    if (flow.decision.kind === 'step' || flow.decision.kind === 'choice') {
      return flow.decision.step;
    }
    return null;
  }, [currentStep, entryPracticeNodeKey, flow, transition]);

  useEffect(() => {
    if (currentStep || transition || !displayStep) return;
    // Reuse the render-derived object. Building a second practice-node step here
    // used to change `displayStep`'s identity, rebuild `request`, and restart Learn.
    setCurrentStep(displayStep);
  }, [currentStep, displayStep, transition]);

  // Freeze curricular scope ids with the committed step. An in-flight Learn
  // request must not depend on the live practiceByKey map: answering writes a
  // milestone, the live query emits a new Map, and a fresh scope array would
  // restart the session.
  const frozenScopeRef = useRef<{
    step: StudyFlowStep | null;
    serial: number;
    ids?: string[];
    milestoneIds?: string[];
  }>({
    step: null,
    serial: 0,
  });
  if (frozenScopeRef.current.step !== displayStep) {
    frozenScopeRef.current = {
      step: displayStep,
      serial: frozenScopeRef.current.serial + 1,
      ids:
        displayStep?.kind === 'practice' && displayStep.mode === 'curricular'
          ? [
              ...(flow?.snapshot.practiceByKey.get(displayStep.nodeKey)?.sessionScopeLessonIds ??
                []),
            ]
          : undefined,
      milestoneIds:
        displayStep?.kind === 'practice' && displayStep.mode === 'curricular'
          ? [...(flow?.snapshot.practiceByKey.get(displayStep.nodeKey)?.scopeLessonIds ?? [])]
          : undefined,
    };
  }
  const committedScopeLessonIds = frozenScopeRef.current.ids;
  const committedMilestoneLessonIds = frozenScopeRef.current.milestoneIds;
  const completedGenerationRef = useRef(-1);

  const request = useMemo<LearnSessionRequest | null>(() => {
    if (!displayStep) return null;
    if (displayStep.kind === 'lesson') {
      return { kind: 'lesson', lessonId: displayStep.lessonId };
    }
    if (displayStep.kind === 'practice') {
      if (displayStep.mode === 'assessment') {
        if (!displayStep.assessmentId) return null;
        return {
          kind: 'practice',
          courseId: courseId ?? '',
          mode: 'assessment',
          assessmentId: displayStep.assessmentId,
          reviewLimit: STUDY_REVIEW_BLOCK_SIZE,
        };
      }
      return {
        kind: 'practice',
        courseId: courseId ?? '',
        nodeKey: displayStep.mode === 'curricular' ? displayStep.nodeKey : undefined,
        scopeLessonIds: committedScopeLessonIds,
        milestoneLessonIds: committedMilestoneLessonIds,
        mode: displayStep.mode,
        reviewLimit: STUDY_REVIEW_BLOCK_SIZE,
      };
    }
    return null;
  }, [committedMilestoneLessonIds, committedScopeLessonIds, courseId, displayStep]);

  const handleStepFinished = useCallback(
    (summary: SessionSummary) => {
      const completed = currentStep ?? displayStep;
      if (!completed || !courseId) return;
      // Explicit report continuation may repeat completion; an outgoing Learn
      // instance must never re-plan or overwrite the next step's transition.
      if (refreshKey <= completedGenerationRef.current) return;
      completedGenerationRef.current = refreshKey;
      touchActiveStudyFlow(courseId);
      setPreviousStep(completed);
      if (completed.kind === 'practice' && completed.mode === 'catch-up' && summary.reachedGoal)
        setCatchUpFinished(true);
      setTransition({ summary, completedStep: completed });
      setRefreshKey((value) => value + 1);
    },
    [courseId, currentStep, displayStep, refreshKey],
  );

  const handleQuestionFinished = useCallback(
    (summary: QuestionStudySummary) => {
      const completed = currentStep ?? displayStep;
      if (!completed || !courseId || refreshKey <= completedGenerationRef.current) return;
      completedGenerationRef.current = refreshKey;
      touchActiveStudyFlow(courseId);
      setPreviousStep(completed);
      setTransition({ completedStep: completed, summary });
      setRefreshKey((value) => value + 1);
    },
    [courseId, currentStep, displayStep, refreshKey],
  );

  const transitionComplete =
    transition !== null &&
    (!('events' in transition.summary) ||
      transition.summary.reachedGoal ||
      transition.summary.blockComplete === true);

  const continueFlow = useCallback(() => {
    if (!transition) return;
    const readyFlow = flow?.generation === refreshKey ? flow : null;
    if (transitionComplete && !readyFlow) return;
    if (pomodoro.breakPending) pomodoro.deferBreak();
    if (!transitionComplete) {
      setTransition(null);
      return;
    }
    // As on entry, a 'choice' decision continues the curriculum: the revision
    // alternative is offered by the study sheet, not mid-flow.
    if (readyFlow?.decision.kind === 'step' || readyFlow?.decision.kind === 'choice') {
      setCurrentStep(readyFlow.decision.step);
      setTransition(null);
      return;
    }
    setCurrentStep(null);
    setTransition(null);
  }, [flow, pomodoro, refreshKey, transition, transitionComplete]);

  // Contiguous Practice continues without the full-screen hand-off once the planner
  // has the next step; see continuesWithoutPause for the boundaries that still pause.
  const nextFlow = flow?.generation === refreshKey ? flow : null;
  const awaitingContinuation =
    transition !== null &&
    'events' in transition.summary &&
    mayContinueWithoutPause(transition.completedStep, transition.summary, pomodoro.breakPending) &&
    (nextFlow === null ||
      continuesWithoutPause(
        transition.completedStep,
        transition.summary,
        nextFlow.decision,
        pomodoro.breakPending,
      ));
  useEffect(() => {
    if (!transition || !nextFlow || !('events' in transition.summary)) return;
    const { decision } = nextFlow;
    if (
      continuesWithoutPause(
        transition.completedStep,
        transition.summary,
        decision,
        pomodoro.breakPending,
      )
    ) {
      setCurrentStep(decision.step);
      setTransition(null);
    }
  }, [nextFlow, pomodoro.breakPending, transition]);

  const reviewDueCards = useCallback(() => {
    if (!courseId) return;
    if (pomodoro.breakPending) pomodoro.deferBreak();
    setCurrentStep(DUE_REVIEW_STEP);
    setTransition(null);
  }, [courseId, pomodoro]);

  if (!courseId || flow === null) {
    return (
      <StudyFlowMessage
        title="Course not found"
        detail="This study flow no longer has a course to follow."
        onExit={finishFlow}
      />
    );
  }

  if (!transition && flow === undefined) {
    return (
      <div className="min-h-dvh bg-paper">
        <StudyExitHeader onExit={finishFlow} />
        <PageLoading />
      </div>
    );
  }

  let scene: string;
  let body: ReactNode;
  if (transition && !awaitingContinuation) {
    const planningNextStep = transitionComplete && flow?.generation !== refreshKey;
    const catchUpIsNext =
      flow?.decision.kind === 'step' &&
      flow.decision.step.kind === 'practice' &&
      flow.decision.step.mode === 'catch-up';
    const nextStep =
      !planningNextStep && (flow?.decision.kind === 'step' || flow?.decision.kind === 'choice')
        ? flow.decision.step
        : undefined;
    const nextQuestions = nextStep?.kind === 'exam-questions' ? nextStep : undefined;
    scene = 'transition';
    body = (
      <StudyStepTransition
        completedLabel={transition.completedStep.label}
        nextLabel={nextStep?.label}
        summary={transition.summary}
        progress={flow?.generation === refreshKey ? flow.progress : undefined}
        nextReason={nextQuestions?.reason}
        nextConceptId={nextQuestions?.conceptId}
        canReviewDueCards={
          transition.completedStep !== DUE_REVIEW_STEP &&
          !planningNextStep &&
          (flow?.snapshot.recurringPracticeEligibleCount ?? 0) > 0
        }
        canReviewEarlierMaterial={
          !planningNextStep && !catchUpIsNext && (flow?.snapshot.catchUpEligibleCount ?? 0) > 0
        }
        onReviewEarlierMaterial={() => {
          if (pomodoro.breakPending) pomodoro.deferBreak();
          setCurrentStep(CATCH_UP_STEP);
          setTransition(null);
        }}
        breakPending={pomodoro.breakPending}
        planningNextStep={planningNextStep}
        onContinue={continueFlow}
        onTakeBreak={pomodoro.acceptBreak}
        onDeferBreak={pomodoro.deferBreak}
        onReviewDueCards={reviewDueCards}
        onFinish={finishFlow}
      />
    );
  } else if (displayStep?.kind === 'exam-questions') {
    scene = `questions-${frozenScopeRef.current.serial}`;
    body = (
      <StudyQuestionStep
        key={scene}
        courseId={courseId}
        conceptId={displayStep.conceptId}
        scopeConceptIds={displayStep.scopeConceptIds}
        allowFamiliar={displayStep.allowFamiliar}
        onComplete={handleQuestionFinished}
        onExit={finishFlow}
      />
    );
  } else if (request && displayStep && flowIdentity) {
    // One scene per committed step. A finished session never serves another card,
    // so StepSwap must not hand the next step to the outgoing Learn instance when
    // the planner answers before its exit completes (#402).
    scene = `learn-${frozenScopeRef.current.serial}`;
    body = (
      <LearnMode
        request={request}
        onStepFinished={handleStepFinished}
        onFlowExit={finishFlow}
        sessionId={flowIdentity?.sessionId}
      />
    );
  } else if (flow?.decision.kind === 'blocked') {
    scene = 'blocked';
    body = (
      <StudyFlowMessage
        title="Nothing is available yet"
        detail={
          flow.decision.reason === 'archived'
            ? 'This course is archived.'
            : 'The next lesson is still locked.'
        }
        onExit={finishFlow}
      />
    );
  } else {
    scene = 'message';
    body = (
      <StudyFlowMessage
        title={flow?.decision.kind === 'empty' ? 'This course is empty' : 'You are caught up'}
        detail={
          flow?.decision.kind === 'empty'
            ? 'Add a lesson before starting this study flow.'
            : 'There is no lesson or practice ready right now.'
        }
        onExit={finishFlow}
      />
    );
  }

  return (
    <StepSwap stepKey={scene} className="min-h-screen">
      {body}
    </StepSwap>
  );
}
