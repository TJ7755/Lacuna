import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PomodoroProvider, usePomodoroFlowContext } from '../hooks/PomodoroContext';
import { useCourseStudyFlow } from '../state/useCourseStudyFlow';
import {
  clearActiveStudyFlow,
  readActiveStudyFlow,
  startActiveStudyFlow,
  touchActiveStudyFlow,
} from '../state/activeStudyFlow';
import type { StudyFlowStep } from '../course/studyFlowPlanner';
import type { SessionSummary } from '../components/learn/types';
import { StudyStepTransition } from '../components/learn/StudyStepTransition';
import { StudyFlowMessage } from '../components/learn/StudyFlowMessage';
import { RevisionPlanSetup } from '../components/learn/RevisionPlanSetup';
import { StepSwap } from '../components/ui/StepSwap';
import { LearnMode, type LearnSessionRequest } from './LearnMode';

interface TransitionState {
  summary: SessionSummary;
  completedStep: StudyFlowStep;
}

export function CourseStudyFlow() {
  return (
    <PomodoroProvider>
      <CourseStudyFlowInner />
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
  const navigate = useNavigate();
  const [flowIdentity, setFlowIdentity] = useState<ReturnType<typeof readActiveStudyFlow>>(() =>
    courseId ? identityFor(courseId) : null,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const flow = useCourseStudyFlow(courseId, refreshKey);
  const entryAssessmentId = searchParams.get('assessmentId');
  const [currentStep, setCurrentStep] = useState<StudyFlowStep | null>(() => {
    if (searchParams.get('review') === 'due') {
      return {
        kind: 'practice',
        nodeKey: 'ad-hoc',
        mode: 'recurring',
        label: 'Review due cards',
      };
    }
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
  const practiceNodeResolved = useRef(false);
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const [revisionSession, setRevisionSession] = useState<{
    planId: string;
    windowId: string;
  } | null>(null);
  const pomodoro = usePomodoroFlowContext();

  useEffect(() => {
    if (!courseId) return;
    setFlowIdentity(identityFor(courseId));
  }, [courseId]);

  useEffect(() => {
    if (currentStep || transition || !flow) return;
    // A deep link may name the practice node to run; honour it while it is still active,
    // and otherwise fall through to whatever the planner says comes next.
    if (entryPracticeNodeKey && !practiceNodeResolved.current) {
      practiceNodeResolved.current = true;
      const requestedPractice = flow.snapshot.practiceByKey.get(entryPracticeNodeKey);
      if (requestedPractice?.active) {
        setCurrentStep({
          kind: 'practice',
          nodeKey: requestedPractice.nodeKey,
          mode: 'curricular',
          label: requestedPractice.label,
        });
        return;
      }
    }
    // 'choice' means an assessment overlaps the next step. The sheet already offered
    // that alternative before entry, and choosing it arrives as ?assessmentId, so
    // reaching here means the curriculum branch was the one chosen.
    if (flow.decision.kind === 'step' || flow.decision.kind === 'choice') {
      setCurrentStep(flow.decision.step);
    }
  }, [currentStep, entryPracticeNodeKey, flow, transition]);

  const finishFlow = useCallback(() => {
    clearActiveStudyFlow();
    navigate(courseId ? `/course/${courseId}` : '/');
  }, [courseId, navigate]);

  // The URL-seeded step is available on the first paint; the planner's next step
  // is not, because it arrives with `flow`. Derive it here rather than waiting
  // for the effect — otherwise the conductor renders "You are caught up" for a
  // frame and StepSwap turns that into a visible crossfade into Learn.
  const displayStep = useMemo<StudyFlowStep | null>(() => {
    if (currentStep) return currentStep;
    if (transition || !flow) return null;
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
    if (flow.decision.kind === 'step' || flow.decision.kind === 'choice') {
      return flow.decision.step;
    }
    return null;
  }, [currentStep, entryPracticeNodeKey, flow, transition]);

  const request = useMemo<LearnSessionRequest | null>(() => {
    if (!displayStep) return null;
    if (displayStep.kind === 'lesson') {
      return { kind: 'lesson', lessonId: displayStep.lessonId };
    }
    if (displayStep.kind === 'practice') {
      if (displayStep.mode === 'assessment') {
        if (!displayStep.assessmentId || !revisionSession) return null;
        return {
          kind: 'practice',
          courseId: courseId ?? '',
          mode: 'assessment',
          assessmentId: displayStep.assessmentId,
          planId: revisionSession.planId,
          windowId: revisionSession.windowId,
        };
      }
      const scopeLessonIds =
        displayStep.mode === 'curricular'
          ? [
              ...(flow?.snapshot.practiceByKey.get(displayStep.nodeKey)?.sessionScopeLessonIds ??
                []),
            ]
          : undefined;
      return {
        kind: 'practice',
        courseId: courseId ?? '',
        nodeKey: displayStep.mode === 'curricular' ? displayStep.nodeKey : undefined,
        scopeLessonIds,
        mode: displayStep.nodeKey === 'ad-hoc' ? 'ad-hoc' : displayStep.mode,
      };
    }
    return null;
  }, [courseId, displayStep, flow?.snapshot.practiceByKey, revisionSession]);

  const handleStepFinished = useCallback(
    (summary: SessionSummary) => {
      const completed = currentStep ?? displayStep;
      if (!completed || !courseId) return;
      touchActiveStudyFlow(courseId);
      if (completed.kind === 'practice' && completed.mode === 'assessment') {
        setRevisionSession(null);
      }
      setTransition({ summary, completedStep: completed });
      setRefreshKey((value) => value + 1);
    },
    [courseId, currentStep, displayStep],
  );

  const continueFlow = useCallback(() => {
    if (!transition) return;
    if (pomodoro.breakPending) pomodoro.deferBreak();
    if (!transition.summary.reachedGoal) {
      setTransition(null);
      return;
    }
    if (flow?.generation !== refreshKey) return;
    // As on entry, a 'choice' decision continues the curriculum: the revision
    // alternative is offered by the study sheet, not mid-flow.
    if (flow.decision.kind === 'step' || flow.decision.kind === 'choice') {
      setCurrentStep(flow.decision.step);
      setTransition(null);
      return;
    }
    setCurrentStep(null);
    setTransition(null);
  }, [flow, pomodoro, refreshKey, transition]);

  const reviewDueCards = useCallback(() => {
    if (!courseId) return;
    if (pomodoro.breakPending) pomodoro.deferBreak();
    setCurrentStep({
      kind: 'practice',
      nodeKey: 'ad-hoc',
      mode: 'recurring',
      label: 'Review due cards',
    });
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

  if (flow === undefined || (transition && flow.generation !== refreshKey)) {
    return (
      <DelayedFallback>
        <CourseStudyFlowSkeleton />
      </DelayedFallback>
    );
  }

  let scene: string;
  let body: ReactNode;
  if (transition) {
    const nextLabel =
      flow.decision.kind === 'step' || flow.decision.kind === 'choice'
        ? flow.decision.step.label
        : undefined;
    scene = 'transition';
    body = (
      <StudyStepTransition
        completedLabel={transition.completedStep.label}
        nextLabel={nextLabel}
        summary={transition.summary}
        canReviewDueCards={
          (transition.completedStep.kind !== 'practice' ||
            transition.completedStep.nodeKey !== 'ad-hoc') &&
          flow.snapshot.recurringPracticeEligibleCount > 0
        }
        breakPending={pomodoro.breakPending}
        onContinue={continueFlow}
        onTakeBreak={pomodoro.acceptBreak}
        onDeferBreak={pomodoro.deferBreak}
        onReviewDueCards={reviewDueCards}
        onFinish={finishFlow}
      />
    );
  } else if (
    displayStep?.kind === 'practice' &&
    displayStep.mode === 'assessment' &&
    displayStep.assessmentId &&
    !revisionSession
  ) {
    scene = 'revision';
    body = (
      <RevisionPlanSetup
        assessmentId={displayStep.assessmentId}
        onStart={(planId, windowId) => setRevisionSession({ planId, windowId })}
        onExit={finishFlow}
      />
    );
  } else if (request && displayStep && flowIdentity) {
    scene = 'learn';
    body = (
      <LearnMode
        request={request}
        onStepFinished={handleStepFinished}
        onFlowExit={finishFlow}
        sessionId={flowIdentity?.sessionId}
      />
    );
  } else if (flow.decision.kind === 'blocked') {
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
        title={flow.decision.kind === 'empty' ? 'This course is empty' : 'You are caught up'}
        detail={
          flow.decision.kind === 'empty'
            ? 'Add a lesson before starting this study flow.'
            : 'There is no lesson or Practice work ready right now.'
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

function CourseStudyFlowSkeleton() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-paper px-6"
      aria-label="Loading course study flow"
    >
      <div className="w-full max-w-xl space-y-4">
        <div className="h-4 w-32 animate-pulse rounded bg-ink/5" />
        <div className="h-12 w-3/4 animate-pulse rounded-xl bg-ink/5" />
        <div className="h-5 w-full animate-pulse rounded bg-ink/5" />
        <div className="mt-8 flex gap-3">
          <span className="h-11 w-32 animate-pulse rounded-xl bg-ink/5" />
          <span className="h-11 w-24 animate-pulse rounded-xl bg-ink/5" />
        </div>
      </div>
    </div>
  );
}
