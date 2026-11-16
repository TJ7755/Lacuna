import type { CardFilter } from '@lacuna/core/db/search';
import type { ReviewSessionKind } from '@lacuna/core/db/types';
import type { SessionSummary } from '../../course/sessionSummary';
import type { AnswerInputPreference } from '../../state/answerInput';
import type { AnswerStrictness } from '../../state/answerStrictness';
import type { LearnModeType } from './types';

export interface SessionRuntimeParams {
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
  onFlowExit?: () => void;
  onStepFinished?: (summary: SessionSummary) => void;
  /** Called whenever a card is served, so per-card view state can reset. */
  onCardServed?: () => void;
  /** Called when the session (re)loads, so session view state can reset. */
  onSessionReset?: () => void;
}

/** Browser capabilities are supplied by the hook; the runtime does not depend on React. */
export interface SessionRuntimeOptions extends SessionRuntimeParams {
  answerInputPreference: AnswerInputPreference;
  navigate(path: string): void | Promise<void>;
  leaveFlow(fallback: string): void;
  notify(
    message: string,
    tone: 'negative',
    options?: {
      actionLabel?: string;
      onAction?: () => void;
      replaceKey?: string;
      keepVisible?: boolean;
    },
  ): void;
  distraction: {
    beginCard(): void;
    setAnswerVisible(visible: boolean): void;
    wasDistracted(): boolean;
    blurredMs(): number;
    sessionMs(): number;
  };
}
