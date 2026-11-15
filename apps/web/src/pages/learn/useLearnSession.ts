import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { DistractionTracker } from '../../components/learn/useDistraction';
import type { useToast } from '../../components/ui/Toast';
import type { SessionSummary } from '../../course/sessionSummary';
import { pauseAssetGc } from '../../db/assets';
import type { CardFilter } from '@lacuna/core/db/search';
import type { ReviewSessionKind } from '@lacuna/core/db/types';
import type { AnswerStrictness } from '../../state/answerStrictness';
import { useAnswerInput } from '../../state/answerInput';
import { useLeaveFlowWith } from '../../utils/editorOrigin';
import type { LearnModeType } from './types';
import { SessionRuntime, type SessionRuntimeOptions } from './sessionRuntime';
export type { AnswerResult } from './answerSteps';
export interface UseLearnSessionParams {
  enabled?: boolean;
  quietCardPractice?: boolean;
  courseId: string | undefined;
  lessonId: string | undefined;
  sessionId: string | undefined;
  tagFilter: string | null;
  filterParams: CardFilter[];
  requestScopeLessonIds: string[] | undefined;
  requestSpecificationPointId?: string;
  /** Fixed lesson prefix of a curricular node's milestone; undefined records no milestone. */
  requestMilestoneLessonIds?: string[];
  requestReviewLimit?: number;
  practiceNodeKeyParam: string | null;
  requestAssessmentId: string | undefined;
  requestPlanId: string | undefined;
  requestWindowId: string | undefined;
  plannedRevision: boolean;
  reviewSessionKind: ReviewSessionKind;
  isSimpleMode: boolean;
  introduceNewCards?: boolean;
  answerStrictness?: AnswerStrictness;
  /** An explicitly requested pass, independent of curricular introductions and practice. */
  standaloneSimple?: boolean;
  /** Optional revision below a future exam target, without a curricular scope. */
  examPractice?: boolean;
  catchUpPractice?: boolean;
  mode: LearnModeType;
  navigate: NavigateFunction;
  onFlowExit?: () => void;
  onStepFinished?: (summary: SessionSummary) => void;
  notify: ReturnType<typeof useToast>['notify'];
  distraction: DistractionTracker;
  /** Called whenever a card is served, so per-card view state can reset. */
  onCardServed?: () => void;
  /** Called when the session (re)loads, so session view state can reset. */
  onSessionReset?: () => void;
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
