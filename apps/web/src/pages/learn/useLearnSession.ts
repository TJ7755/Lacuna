import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import type { useToast } from '../../components/ui/Toast';
import { pauseAssetGc } from '../../db/assets';
import { useAnswerInput } from '../../state/answerInput';
import { useLeaveFlowWith } from '../../utils/editorOrigin';
import { SessionRuntime } from './sessionRuntime';
import type { SessionRuntimeOptions, SessionRuntimeParams } from './sessionRuntimeOptions';

export interface UseLearnSessionParams extends SessionRuntimeParams {
  navigate: NavigateFunction;
  notify: ReturnType<typeof useToast>['notify'];
  distraction: DistractionTracker;
}

/** React owns subscription and browser adapters; the runtime owns the session. */
export function useLearnSession(params: UseLearnSessionParams) {
  const [answerInputPreference] = useAnswerInput();
  const leave = useRef<(fallback: string) => void>(() => {});
  const options: SessionRuntimeOptions = {
    ...params,
    answerInputPreference,
    leaveFlow: (fallback) => leave.current(fallback),
  };
  const identity = JSON.stringify([
    params.enabled ?? true,
    params.courseId,
    params.lessonId,
    params.sessionId,
    params.tagFilter,
    params.filterParams,
    params.requestScopeLessonIds,
    params.requestSpecificationPointId,
    params.requestMilestoneLessonIds,
    params.requestReviewLimit,
    params.practiceNodeKeyParam,
    params.requestAssessmentId,
    params.requestPlanId,
    params.requestWindowId,
    params.plannedRevision,
    params.reviewSessionKind,
    params.isSimpleMode,
    params.introduceNewCards,
    params.standaloneSimple,
    params.examPractice,
    params.catchUpPractice,
    params.mode,
  ]);
  // Identity changes replace the owner. Equal rebuilt route arrays retain the session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runtime = useMemo(() => new SessionRuntime(options), [identity]);
  runtime.updateAdapters(options);
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
  const leaveFlow = useLeaveFlowWith(params.navigate, snapshot.exitTo);
  leave.current = () => leaveFlow();
  useEffect(() => {
    runtime.start();
    return runtime.dispose;
  }, [runtime]);
  useEffect(() => (params.enabled !== false ? pauseAssetGc() : undefined), [params.enabled]);
  const currentCard = snapshot.current;
  useEffect(() => runtime.preload(), [runtime, currentCard, snapshot.phase]);
  return snapshot;
}
