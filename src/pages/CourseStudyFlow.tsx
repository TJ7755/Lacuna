import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PomodoroProvider, usePomodoroContext } from '../hooks/PomodoroContext';
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
import { Button } from '../components/ui/Button';
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

function CourseStudyFlowInner() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const flow = useCourseStudyFlow(courseId, refreshKey);
  const [currentStep, setCurrentStep] = useState<StudyFlowStep | null>(() =>
    searchParams.get('review') === 'due'
      ? {
          kind: 'practice',
          nodeKey: 'ad-hoc',
          mode: 'recurring',
          label: 'Review due cards',
        }
      : null,
  );
  const entryPracticeNodeKey = searchParams.get('practiceNode');
  const [entryConsumed, setEntryConsumed] = useState(searchParams.get('review') === 'due');
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const pomodoro = usePomodoroContext();

  useEffect(() => {
    if (!courseId) return;
    const stored = readActiveStudyFlow();
    if (stored?.courseId === courseId) touchActiveStudyFlow(courseId);
    else startActiveStudyFlow(courseId);
  }, [courseId]);

  useEffect(() => {
    if (currentStep || transition || !flow) return;
    if (!entryConsumed) {
      setEntryConsumed(true);
      const requestedPractice = entryPracticeNodeKey
        ? flow.snapshot.practiceByKey.get(entryPracticeNodeKey)
        : undefined;
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
    if (flow.decision.kind === 'step') {
      setCurrentStep(flow.decision.step);
    }
  }, [currentStep, entryConsumed, entryPracticeNodeKey, flow, transition]);

  const finishFlow = useCallback(() => {
    clearActiveStudyFlow();
    navigate(courseId ? `/course/${courseId}` : '/');
  }, [courseId, navigate]);

  const request = useMemo<LearnSessionRequest | null>(() => {
    if (!currentStep) return null;
    if (currentStep.kind === 'lesson') {
      return { kind: 'lesson', lessonId: currentStep.lessonId };
    }
    if (currentStep.kind === 'practice') {
      const scopeLessonIds =
        currentStep.mode === 'curricular'
          ? [...(flow?.snapshot.practiceByKey.get(currentStep.nodeKey)?.scopeLessonIds ?? [])]
          : undefined;
      return {
        kind: 'practice',
        courseId: courseId ?? '',
        nodeKey: currentStep.mode === 'curricular' ? currentStep.nodeKey : undefined,
        scopeLessonIds,
        mode: currentStep.nodeKey === 'ad-hoc' ? 'ad-hoc' : currentStep.mode,
      };
    }
    return null;
  }, [courseId, currentStep, flow?.snapshot.practiceByKey]);

  const handleStepFinished = useCallback(
    (summary: SessionSummary) => {
      if (!currentStep || !courseId) return;
      touchActiveStudyFlow(courseId);
      setTransition({ summary, completedStep: currentStep });
      setRefreshKey((value) => value + 1);
    },
    [courseId, currentStep],
  );

  const continueFlow = useCallback(() => {
    if (!transition) return;
    if (pomodoro.breakPending) pomodoro.deferBreak();
    if (!transition.summary.reachedGoal) {
      setTransition(null);
      return;
    }
    if (flow?.generation !== refreshKey) return;
    if (flow.decision.kind === 'step') {
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
      <FlowMessage
        title="Course not found"
        detail="This study flow no longer has a course to follow."
        onExit={finishFlow}
      />
    );
  }

  if (flow === undefined || (transition && flow.generation !== refreshKey)) {
    return <CourseStudyFlowSkeleton />;
  }

  if (transition) {
    const nextLabel = flow.decision.kind === 'step' ? flow.decision.step.label : undefined;
    return (
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
  }

  if (request && currentStep) {
    return (
      <LearnMode request={request} onStepFinished={handleStepFinished} onFlowExit={finishFlow} />
    );
  }

  if (flow.decision.kind === 'blocked') {
    return (
      <FlowMessage
        title="Nothing is available yet"
        detail={
          flow.decision.reason === 'archived'
            ? 'This course is archived.'
            : 'The next lesson is still locked.'
        }
        onExit={finishFlow}
      />
    );
  }

  return (
    <FlowMessage
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

function FlowMessage({
  title,
  detail,
  onExit,
}: {
  title: string;
  detail: string;
  onExit: () => void;
}) {
  return (
    <div className="min-h-screen bg-paper px-6 py-10">
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <p className="mb-2 text-sm uppercase tracking-[0.18em] text-ink-faint">Course study</p>
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">{title}</h1>
        <p className="mt-4 text-ink-soft">{detail}</p>
        <div className="mt-8">
          <Button variant="primary" size="lg" onClick={onExit}>
            Done
          </Button>
        </div>
      </main>
    </div>
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
