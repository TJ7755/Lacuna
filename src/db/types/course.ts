import type { Specification } from '../../specifications/catalogue';
import type { SpecificationReference } from '../../specifications/links';
import type { CardFilter } from '../search';
import type { ExamObjective, FsrsParameters } from './scheduling';

// ---------------------------------------------------------------------------
// Course architecture (Course -> Lesson -> Note + Card).
//
// These are the live domain tables. Schema v22 removed the hidden Deck and
// Folder stores. LegacyDeckRecord and LegacyFolder remain as the Dexie
// upgrade, snapshot-builder and test-fixture shape; they are not live stores
// and are no longer an import boundary.
// ---------------------------------------------------------------------------

/**
 * How lessons unlock along a course path. Replaces the original `pathMode`.
 *  - `linear`: lessons are date-gated by a cadence (anchorDate + i * intervalDays),
 *    with optional per-lesson `releaseDate` overrides that cascade.
 *  - `semi-linear`: lessons are completion-gated and sequential (see Lesson.unlockedAt).
 *  - `open`: everything is unlocked immediately; no locking UI.
 */
export type UnlockMode = 'linear' | 'semi-linear' | 'open';

/**
 * A Course is the new scheduling unit, inheriting every scheduling field the old
 * Deck owned plus course-path configuration. The FSRS engine schedules a course's
 * cards against the nearest applicable exam date (see src/fsrs/examDate.ts).
 */
export interface CourseRecord {
  /** Literal creator/project display label; not verified authorship or approval. */
  creator?: string;
  id: string;
  name: string;
  description: string;
  examBoard?: string;
  specification?: string;
  specificationRef?: SpecificationReference;
  /** Specification metadata and source supplied with this Course. */
  specificationData?: Specification;
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
  colour?: string;
  // Scheduling (inherited from the old Deck).
  /** Set true once the exam-date prompt has been answered or dismissed. */
  examDatePromptDismissed?: boolean;
  fsrsVersion: number;
  fsrsParameters: FsrsParameters;
  examObjective: ExamObjective;
  newCardsPerDay?: number;
  /** Whether lesson sessions introduce cards before scheduling them. Undefined defaults to true. */
  learnFirst?: boolean;
  maxReviewsPerDay?: number;
  archived?: boolean;
  autoOptimise?: boolean;
  leechThreshold?: number;
  leechAction?: 'suspend' | 'tag' | 'none';
  dailyReviewGoal?: number;
  sessionTimeLimitMinutes?: number;
  lastInteractedAt?: number;
  // Course-path configuration.
  unlockMode: UnlockMode;
  /** Cadence for `linear` unlock mode; ignored under other modes. */
  linearCadence?: { anchorDate: number; intervalDays: number };
  /** When true, the system auto-inserts practice nodes between lessons. */
  autoPractice: boolean;
  /** Local traversal preference on supported locked copies; never published content. */
  localLessonOrder?: string[];
  /** Local entry point; earlier material remains in catch-up and assessment practice. */
  studyStartLessonId?: string;
  /** Minutes-to-clear threshold that triggers practice when the exam is not near. */
  practiceThresholdMinutesFar: number;
  /** Minutes-to-clear threshold that triggers practice when the exam is near. */
  practiceThresholdMinutesNear: number;
  /** Days-until-exam at or below which the "near" threshold applies. */
  practiceUrgentWindowDays: number;
  /** Backstop: force a practice node after this many lessons without one. */
  practiceMaxGap: number;
  /**
   * Per-course override of the global lesson-view-mode default (see
   * src/state/lessonViewMode.ts). Undefined inherits the global default.
   * Resolved via src/course/lessonViewMode.ts, which is also the single gate
   * for whether edit mode is available at all.
   */
  lessonViewMode?: 'study' | 'edit';
  /**
   * Present iff this course is a distributed copy imported from a teacher's
   * published lineage (Arc 7 §7.2). Absent for every course authored locally
   * or imported before this arc, which is exactly today's default and needs
   * no migration.
   */
  distributedCopy?: CourseDistributedCopy;
  /**
   * Teacher-side publish state: present once the teacher has clicked Publish
   * at least once. Distinct from `distributedCopy` — this course is the
   * lineage's origin, not a copy of it (Arc 7 §7.2). `shareId` is the stable
   * relay capability id behind the `/#/s/<code>` link, present once the
   * course has been published to a share link; `shareRevision` is the
   * revision actually uploaded there (a plain publish can move `revision`
   * ahead of it). Both are public (the id appears in the URL) and need no
   * migration, like the rest of this object.
   */
  distribution?: {
    lineageId: string;
    revision: number;
    publishedAt: number;
    shareId?: string;
    shareRevision?: number;
  };
}

/** A student's distributed-copy tracking on an imported `Course` (Arc 7 §7.2). */
export interface CourseDistributedCopy {
  /** Matches the teacher's `Course.distribution.lineageId`. */
  lineageId: string;
  /** Last-imported/merged revision number. */
  revision: number;
  /** True unless the student has detached from the lineage. */
  locked: boolean;
  /** Whether non-conflicting updates apply automatically on re-import. Defaults to true for new shared-course imports. */
  autoAcceptUpdates: boolean;
  /** Optional "shared by" display string, mirrors `by` in `SharePayloadV2`. */
  sourceLabel?: string;
  /** The teacher's course details as last imported. A later update applies a changed
   *  detail only where the local value still matches this, so a learner's own rename
   *  survives. Absent on copies imported before course details were updated. */
  source?: {
    name: string;
    description: string;
    unlockMode: UnlockMode;
    creator?: string;
    examBoard?: string;
    specification?: string;
    specificationRef?: SpecificationReference;
    /** Specification metadata and source supplied with this Course. */
    specificationData?: Specification;
  };
}

/**
 * Hydrated course view used by existing scheduling consumers during the assessment
 * migration. The compatibility date fields are derived from the course's one final
 * assessment and are never persisted on the course row.
 */
export type CourseSchedulingMode = 'exam' | 'steady';

export interface Course extends CourseRecord {
  /** Derived from the final assessment; old dated rows infer `exam`. */
  readonly schedulingMode?: CourseSchedulingMode;
  readonly examDate?: number;
  readonly timeZone?: string;
}

export type AssessmentKind = 'final' | 'checkpoint';

interface CourseAssessmentBase {
  id: string;
  courseId: string;
  name: string;
  kind: AssessmentKind;
  /** `steady` is valid only for the sole final assessment; old dated finals infer `exam`. */
  schedulingMode?: CourseSchedulingMode;
  /** Assessment date/time as epoch milliseconds in UTC; absent for steady retention. */
  examDate?: number;
  timeZone?: string;
  /** Stable path anchor, independent of which lessons the assessment covers. */
  afterLessonId: string | null;
  /** Cards omitted from this assessment without changing lesson membership. */
  excludedCardIds: string[];
  /** Set when automatic repair after lesson deletion needs an author's review. */
  needsAuthorConfirmation?: boolean;
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
}

/**
 * A final assessment or intermediate checkpoint. Prefix coverage expands through
 * `afterLessonId`; custom coverage stores an explicit, non-contiguous lesson set.
 */
export type CourseAssessment = CourseAssessmentBase &
  (
    | {
        coverageMode: 'prefix';
        lessonIds?: never;
        specificationPaperId?: never;
        specificationPointIds?: never;
      }
    | {
        coverageMode: 'custom';
        lessonIds: string[];
        specificationPaperId?: never;
        specificationPointIds?: never;
      }
    | ({ coverageMode: 'specification'; lessonIds?: never } & (
        | { specificationPaperId: string; specificationPointIds?: never }
        | { specificationPaperId?: never; specificationPointIds: string[] }
      ))
  );

export type RevisionProjection =
  | {
      projectionMode: 'memory-model';
      memoryModelVersion: string;
    }
  | {
      projectionMode: 'fsrs-6-practice-fallback';
      memoryModelVersion: 'fsrs-6';
      fallbackReason: 'missing' | 'corrupt' | 'unsupported';
    };

export type RevisionReplanReason =
  | 'assessment-coverage-changed'
  | 'assessment-deadline-changed'
  | 'assessment-time-zone-changed'
  | 'memory-model-changed'
  | 'reached-lessons-changed'
  | 'card-exposure-changed'
  | 'card-availability-changed'
  | 'review-evidence-changed';

export interface RevisionPlanInputSnapshot {
  coverageVersion: string;
  deadlineAt: number;
  timeZone?: string;
  reachedLessonIds: string[];
  exposureVersion: string;
  availabilityVersion: string;
  reviewEvidenceVersion: string;
  projection: RevisionProjection;
}

export interface RevisionPlanScopeSnapshot {
  coveredLessonIds: string[];
  excludedCardIds: string[];
  eligibleCardIds: string[];
  unavailableCardIds: string[];
  unreachedLessonIds: string[];
  untaughtLessonIds: string[];
}

export interface RevisionPlanCardState {
  cardId: string;
  status: 'eligible' | 'unavailable';
}

export interface RevisionPlanWindow {
  id: string;
  day: string;
  budgetMinutes: number;
  status: 'scheduled' | 'active' | 'completed';
  planRevision: number;
  startedAt?: number;
  completedAt?: number;
}

export interface RevisionPlanSession {
  id: string;
  windowId: string;
  startedAt: number;
  completedAt: number;
  cardIds: string[];
  reviewEventIds: string[];
  improvedCardIds?: string[];
  parkedCardIds?: string[];
}

export interface RevisionPlanReplan {
  id: string;
  revision: number;
  reasons: RevisionReplanReason[];
  explanation: string;
  appliedAt: number;
}

export interface RevisionPlanPendingReplan {
  reasons: RevisionReplanReason[];
  requestedAt: number;
  input: RevisionPlanInputSnapshot;
  scope: RevisionPlanScopeSnapshot;
  cardStates: RevisionPlanCardState[];
}

/** One durable multi-day revision plan. Card queues are deliberately never persisted. */
export interface RevisionPlan {
  id: string;
  assessmentId: string;
  courseId: string;
  status: 'active' | 'completed';
  revision: number;
  input: RevisionPlanInputSnapshot;
  scope: RevisionPlanScopeSnapshot;
  cardStates: RevisionPlanCardState[];
  windows: RevisionPlanWindow[];
  completedSessions: RevisionPlanSession[];
  replans: RevisionPlanReplan[];
  pendingReplan?: RevisionPlanPendingReplan;
  createdAt: number;
  updatedAt: number;
}

/**
 * Temporary v6-backup projection for checkpoint rows. The live database never
 * stores this shape; backup migration moves it into CourseAssessment.
 */
export interface AssessmentDateCompatibility {
  id: string;
  courseId: string;
  name: string;
  examDate: number;
  timeZone?: string;
  lessonIds?: string[];
  excludedCardIds?: string[];
  createdAt: number;
}

/** A learning unit on the course path: notes plus the cards taught in it. */
export type AnswerMode = 'reveal' | 'type';

export interface Lesson {
  /** Advisory same-Course Lesson ids. Absence means none; never gates study. */
  prerequisiteLessonIds?: string[];
  /** Default for cards without their own answer mode. */
  answerMode?: AnswerMode;
  id: string;
  courseId: string;
  name: string;
  description?: string;
  /** Position on the path. */
  orderIndex: number;
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
  // Optional lesson-level exam-date override (highest scheduling priority).
  examDate?: number;
  timeZone?: string;
  /** Explicit release-date override; only meaningful under `linear` unlock mode. */
  releaseDate?: number;
  /**
   * Set once the unlock condition is met under `semi-linear`; a one-way ratchet
   * that is never cleared, so a later-materialising practice node cannot re-lock
   * already-available content. Undefined means not yet unlocked.
   */
  unlockedAt?: number;
  /**
   * Optional, off-path enrichment. Extension lessons are always unlocked, never
   * counted in core progress, and excluded from the study pool until opted into.
   */
  isExtension: boolean;
  /** Legacy import field. Arc 4 lesson sessions always teach unexposed members. */
  sessionFilter?: 'new' | 'due' | 'mixed';
}

/** A rich Markdown content block within a Lesson. */
export interface Note {
  id: string;
  lessonId: string;
  name: string;
  /** Rich Markdown source, rendered with the same engine as cards. */
  content: string;
  orderIndex: number;
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
}

/** Links a card into an additional lesson. Governs display/grouping only, never FSRS eligibility. */
export interface LessonCardLink {
  id: string;
  lessonId: string;
  cardId: string;
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
}

/** Records that a card has been successfully introduced in one specific lesson. */
export interface LessonCardExposure {
  lessonId: string;
  cardId: string;
  taughtAt: number;
  /** Last mutation time. Required after schema v23; backfilled from taughtAt. */
  updatedAt: number;
}

/** Explicit completion for a lesson with no cards to expose. */
export interface LessonCompletion {
  lessonId: string;
  completedAt: number;
  /** Last mutation time. Required after schema v23; backfilled from completedAt. */
  updatedAt: number;
}

/**
 * Device-local highlight or annotation anchored to a Note's Markdown source.
 * This table is deliberately absent from every portability format.
 */
export interface NoteAnnotation {
  id: string;
  noteId: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  body?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A practice node on the path. `auto` nodes are positioned dynamically at render
 * time and never persist a position; `manual` nodes are teacher-authored.
 */
export interface PracticeNode {
  id: string;
  courseId: string;
  type: 'auto' | 'manual' | 'question-set';
  /** Only meaningful for `manual`; `auto` nodes are positioned at render time. */
  position?: number;
  name: string;
  /** Which lessons' cards to include; undefined = the whole course. */
  lessonIds?: string[];
  filters?: CardFilter[];
  /** Limit the session to N cards. */
  cardCount?: number;
  randomize?: boolean;
  /** Authored Question Set activity only; never used as a Card practice scope. */
  questionSetIds?: string[];
  /** Exact lesson anchor for a Question Set activity. */
  afterLessonId?: string;
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
}

export interface QuestionSetPracticeNode extends PracticeNode {
  type: 'question-set';
  questionSetIds: string[];
  afterLessonId: string;
}

/** Persisted progress for one stable practice path node and its current card scope. */
export interface PracticeMilestone {
  /** The PathNode id: authored node id for manual nodes, deterministic id for auto nodes. */
  nodeKey: string;
  courseId: string;
  /** Caller-derived fingerprint/version of the node's effective card scope. */
  scopeVersion: string;
  /** Last measured secured-card count for the current scope. */
  securedCardCount: number;
  totalCardCount: number;
  updatedAt: number;
  /** Set once this scope's practice objective is reached; retained if readiness later decays. */
  completedAt?: number;
}
