import type {
  CheckerDisputeReport,
  FsrsCardState,
  FsrsParameters,
  Grade,
  LineVerdict,
} from '../db/types';
import type { QuestionPayload } from '../items/types';

export const QUESTION_SCHEDULER_VERSION = 'fsrs-6-question-v1' as const;
export const QUESTION_GRADE_MAPPING_VERSION = 'full-good-otherwise-again-v1' as const;

export type { QuestionPayload } from '../items/types';

/**
 * A stable identity for a piece of knowledge used by Cards and Questions.
 * `provisional` is true when migration inferred the grouping; inference cannot
 * certify that a legacy Card was genuinely atomic.
 */
interface ConceptBase {
  id: string;
  scopeKey: string;
  name: string;
  provisional: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A stable knowledge identity. The UI calls this a Concept. */
export type Concept =
  | (ConceptBase & {
      scope: 'course';
      courseId: string;
      legacySchedulingUnitId?: never;
    })
  | (ConceptBase & {
      scope: 'legacy-scheduling-unit';
      courseId: null;
      legacySchedulingUnitId: string;
      provisional: true;
    });

/** One atomically replaced relationship set per Question. */
export interface QuestionConceptSet {
  /** Primary key; one row per Question. */
  questionId: string;
  courseId: string;
  /** Exactly one entry in v1; kept as an array so multi-target does not need a migration. */
  targetConceptIds: string[];
  prerequisiteConceptIds: string[];
  /** Matches the Question definition revision when links and content were saved atomically. */
  authoringRevisionId: string;
  authoringUpdatedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface QuestionScheduleState {
  stability: number | null;
  difficulty: number | null;
  lastReviewed: number | null;
  reps: number;
  lapses: number;
  state: FsrsCardState;
  due: number | null;
  scheduledDays: number;
  learningSteps: number;
}

/**
 * Preserves a structured Card's exact schedule without pretending its legacy
 * review rows contain replayable Question receipts.
 */
export type QuestionScheduleBaseline =
  | { kind: 'new' }
  | {
      kind: 'legacy-replayable';
      sourceCardId: string;
      sourceReviewIds: string[];
    }
  | {
      kind: 'legacy-opaque';
      sourceCardId: string;
      state: QuestionScheduleState;
      reason: 'missing-history' | 'inconsistent-history';
    };

export interface QuestionScheduleEpoch {
  id: string;
  startedAt: number;
  reason: 'created' | 'semantic-edit' | 'legacy-card-migration';
  baseline: QuestionScheduleBaseline;
}

interface QuestionDefinitionBase extends QuestionScheduleState {
  id: string;
  courseId: string;
  primaryLessonId: string | null;
  additionalLessonIds: string[];
  name: string;
  tags: string[];
  suspended: boolean;
  contentVersion: number;
  contentRevisionId: string;
  authoringRevisionId: string;
  authoringUpdatedAt: number;
  scheduleEpoch: QuestionScheduleEpoch;
  scheduleUpdatedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface FixedQuestionDefinition extends QuestionDefinitionBase {
  kind: 'fixed';
  prompt: string;
  payload: QuestionPayload;
  explanation: string;
  explanationStatus: 'authored' | 'legacy-derived';
}

export interface GeneratedQuestionDefinition extends QuestionDefinitionBase {
  kind: 'generated';
  generatorKey: string;
  generatorVersion: number;
  generatorConfig: unknown;
}

export type QuestionDefinition = FixedQuestionDefinition | GeneratedQuestionDefinition;

export type QuestionAttemptStatus = 'shown' | 'answered' | 'abandoned';

export interface QuestionCorrection {
  submittedAt: number;
  submittedAnswer: string | string[];
  marksEarned: number;
  marksAvailable: number;
  lineVerdicts?: LineVerdict[];
}

/** Immutable presentation receipt plus the result of its first submission. */
export interface QuestionAttempt {
  id: string;
  questionId: string;
  courseId: string;
  contentVersion: number;
  contentRevisionId: string;
  scheduleEpochId: string;
  purpose: 'post-instruction';
  shownAt: number;
  answeredAt?: number;
  abandonedAt?: number;
  /** Undo retains the immutable answer evidence and excludes it from replay. */
  undoneAt?: number;
  updatedAt: number;
  status: QuestionAttemptStatus;
  receiptOrigin: 'native' | 'legacy-reconstructed';
  sourceCardId?: string;
  sourceReviewId?: string;
  historicalPresentationKnown?: false;
  submittedAnswerKnown?: boolean;

  generatorKey?: string;
  generatorVersion?: number;
  seed?: string;
  parameters?: Record<string, string | number | boolean>;
  generatorFingerprint?: string;

  renderedPrompt: string;
  resolvedPayload: QuestionPayload;
  renderedExplanation: string;
  submittedAnswer?: string | string[];
  marksEarned?: number;
  marksAvailable?: number;
  lineVerdicts?: LineVerdict[];
  checkerDisputes?: CheckerDisputeReport[];
  correction?: QuestionCorrection;
  responseTimeSeconds?: number;
  grade?: Grade;
  retrievabilityAtAttempt?: number | null;

  scheduleEffect:
    | { kind: 'replay'; grade: Grade }
    | { kind: 'included-in-opaque-baseline' }
    | { kind: 'none' };
  schedulerVersion?: typeof QUESTION_SCHEDULER_VERSION;
  gradeMappingVersion?: typeof QUESTION_GRADE_MAPPING_VERSION;
  schedulerConfigFingerprint?: string;
  /** Stored on the first attempt and whenever configuration changes. */
  schedulerConfig?: FsrsParameters;
  sessionId: string;
}

export interface ResolvedQuestionInstance {
  renderedPrompt: string;
  resolvedPayload: QuestionPayload;
  renderedExplanation: string;
  generatorKey?: string;
  generatorVersion?: number;
  seed?: string;
  parameters?: Record<string, string | number | boolean>;
  generatorFingerprint?: string;
}
