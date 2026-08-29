// Shared domain types for Lacuna's local data model.
// All persistence is via IndexedDB (see schema.ts). British English throughout.

import type { CardFilter } from './search';
import type { CardUpdate, LessonUpdate, LineageConflict, NoteUpdate } from './lineageDiff';
import type { ReviewHistoryEntry } from './reviewHistory';
import type {
  ItemFixture as SharedItemFixture,
  ItemPayload as SharedItemPayload,
  MarkSchemeLine as SharedMarkSchemeLine,
  NumericAnswerSpec as SharedNumericAnswerSpec,
} from '../items/types';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '../questions/types';

export type CardType = 'front_back' | 'cloze' | 'basic_reversed';

/** FSRS grade: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy. Matches ts-fsrs `Grade`. */
export type Grade = 1 | 2 | 3 | 4;

/**
 * FSRS memory state, mirroring ts-fsrs `State`:
 * 0 = New, 1 = Learning, 2 = Review, 3 = Relearning.
 */
export type FsrsCardState = 0 | 1 | 2 | 3;

/**
 * The trainable FSRS-6 parameter set persisted per deck. `w` holds the 21
 * FSRS-6 weights (w0..w20); w20 is the trainable decay. `requestRetention` is
 * the target retention ts-fsrs uses when scheduling.
 *
 * Additional controls:
 *   - `enable_fuzz`: adds a small random variation to intervals so cards don't
 *     cluster on the same day.
 *   - `maximum_interval`: caps the longest scheduled interval (days).
 *   - `learning_steps`: learning-stage intervals (e.g. ["1m", "10m"]) before a
 *     new card graduates to review.
 *   - `relearning_steps`: relearning-stage intervals after a lapse.
 */
export interface FsrsParameters {
  w: number[];
  requestRetention: number;
  enable_fuzz: boolean;
  maximum_interval: number;
  learning_steps: string[];
  relearning_steps: string[];
}

/**
 * Which quantity the deck is being optimised for. The scheduler's sort metric
 * and the progress bar are always derived from this single value so they can
 * never disagree (see src/fsrs/objective.ts).
 *
 * - `expectedMarks`: maximise the sum of predicted exam-day retrievability.
 *   Scheduler sorts by Delta-R; progress bar shows mean predicted R.
 * - `securedTopics`: maximise the count of cards at or above 0.90 on exam day.
 *   Scheduler prioritises cards that cross the threshold, cheapest first;
 *   progress bar shows the fraction of cards at or above 0.90.
 */
export type ExamObjective = 'expectedMarks' | 'securedTopics';

/** The study context that produced a review event. */
export type ReviewSessionKind =
  | 'deck'
  | 'lesson'
  | 'practice'
  | 'assessment-revision'
  | 'revision-plan';

/** A single review event appended to a card's history. */
export interface ReviewLog {
  /** Stable identity for this attempt. Optional only for history written before schema v16. */
  eventId?: string;
  /** Stable identity shared by attempts in the same study session. */
  sessionId?: string;
  /** The study context that produced the attempt. */
  sessionKind?: ReviewSessionKind;
  /** Optional revision provenance populated by the revision-plan flow. */
  revisionPlanId?: string;
  revisionWindowId?: string;
  timestamp: number;
  grade: Grade;
  /** Explicit outcome retained independently of the scheduler grade. */
  correct?: boolean;
  /** Measured response time in seconds (time from reveal to "Show Answer"). */
  responseTimeSec: number;
  /** Whether the user lost focus while the answer was pending (report only; no grade effect). */
  distracted: boolean;
  /**
   * Whether a lines-mode hint (see src/components/learn/LineHint.tsx) was used before
   * this review. Optional and additive so existing history entries and backups remain
   * valid without a migration. Drives the silent-mode grading penalty (see
   * HINT_TIME_PENALTY_SEC in src/fsrs/grading.ts) and is logged alongside the true,
   * unpenalised `responseTimeSec` so the penalty can later be fitted from real data.
   */
  hintUsed?: boolean;
  stabilityBefore: number | null;
  stabilityAfter: number;
  difficultyBefore: number | null;
  difficultyAfter: number;
  /** Retrievability at the moment of review (null on a first review). */
  retrievabilityAtReview: number | null;
  /**
   * Optional and additive fingerprint of the FSRS weight set that produced this
   * prediction, so existing history and backups remain valid without a migration.
   * Absent for imported history and reviews recorded before this field existed.
   */
  fsrsWeightsFingerprint?: string;
  /**
   * Marks earned/available for a machine-verified `numeric`/`working` item response
   * (Arc 11; docs/archive/roadmap-2026-08-11.md §11.7). Optional and additive, matching the `hintUsed`/
   * `retrievabilityAtReview` precedent above — absent for classic-type reviews and
   * for history written before this field existed. The grade mapping that derives
   * `grade` from these figures, and their test coverage, is Arc 11 slice-1 Task 4's
   * to build; this field is declared here only so Task 4 does not need to reopen
   * this interface.
   */
  marksEarned?: number;
  /** Total marks available for the response this log entry records. See `marksEarned`. */
  marksAvailable?: number;
  /**
   * Per-line verdicts for a `working` item response, produced by `verifyWorkingLines`
   * (Arc 11 slice-1 Task 2, `src/items/verify.ts`) and persisted verbatim so the
   * checker's behaviour is auditable and reproducible from the logged seed. See
   * `LineVerdict`.
   */
  lineVerdicts?: LineVerdict[];
  /** Learner-raised checker disputes attached to this machine-marked attempt. */
  checkerDisputes?: CheckerDisputeReport[];
}

/**
 * The verdict for one student-written line within a `working` item, as produced by
 * `verifyWorkingLines` (Arc 11 slice-1 Task 2, `src/items/verify.ts`) and persisted
 * verbatim on `ReviewLog.lineVerdicts` (docs/archive/roadmap-2026-08-11.md §11.7). Declared here, ahead of
 * `verify.ts`'s implementation, so `ReviewLog`'s shape is frozen from Task 1 onward;
 * `verify.ts` is expected to produce values of this exact shape rather than a second,
 * incompatible one.
 */
export interface LineVerdict {
  /** The student's line, verbatim. */
  studentLine: string;
  /** Index into the matched scheme's `MarkSchemeLine[]`, or null if no line matched. */
  matchedLineIndex: number | null;
  /** Marks earned for this line (0 when unmatched). */
  marksEarned: number;
  /** Seeds used by random-equivalence checks while reaching this verdict. */
  checkerSeeds?: string[];
  /**
   * Set when the checker could not reach a verdict at all — a scheme expression that
   * no longer parses, or a comparison whose domain defeated the sampler. The line earns
   * no marks, but it is not a wrong answer and must not be presented as one. Absent on
   * every verdict recorded before this distinction existed.
   */
  undetermined?: true;
}

/** A reproducible learner report that an automatic checker verdict was wrong. */
export interface CheckerDisputeReport {
  reportedAt: number;
  question: string;
  studentLine: string;
  verdict: {
    correct: boolean;
    marksEarned: number;
    matchedLineIndex?: number | null;
    /** Mirrors `LineVerdict.undetermined`: the checker abstained rather than said wrong. */
    undetermined?: true;
  };
  /** Empty for deterministic numeric/predicate checks; populated for random equivalence. */
  checkerSeeds: string[];
}

/**
 * The structural subset of scheduling fields the FSRS engine reads. Both Deck
 * and Course satisfy it, so the engine can schedule either without caring which
 * model it is fed. This is the seam that lets the scheduler become Course-capable
 * without renaming deckId to courseId across every call site: widen a function
 * from `Deck` to `SchedulerConfig` and every existing Deck caller still type-checks.
 *
 * `examDate` here is the unit-level default; per-card exam dates (lesson overrides
 * and course checkpoints) are resolved separately in src/fsrs/examDate.ts.
 */
export interface SchedulerConfig {
  id: string;
  examDate: number;
  examObjective: ExamObjective;
  fsrsParameters: FsrsParameters;
  archived?: boolean;
  newCardsPerDay?: number;
  maxReviewsPerDay?: number;
  leechThreshold?: number;
  leechAction?: 'suspend' | 'tag' | 'none';
}

/** Normalised Deck row accepted only at legacy migration and import boundaries. */
export interface LegacyDeckRecord {
  id: string;
  name: string;
  /** Exam date/time as an epoch millisecond value, stored in UTC. Defaults to creation + 7 days at 23:59 local. */
  examDate: number;
  /**
   * IANA time zone name (e.g. 'Europe/London') captured when the exam date is set.
   * Used to display the exam date consistently in the original time zone even if
   * the user moves to a different one.
   */
  timeZone?: string;
  createdAt: number;
  /** Set true once the user has set or dismissed the exam-date prompt with "don't ask again". */
  examDatePromptDismissed?: boolean;
  /** FSRS algorithm version this deck's parameters belong to (6 for FSRS-6). */
  fsrsVersion: number;
  /** The FSRS-6 parameter set used for every memory-state update in this deck. */
  fsrsParameters: FsrsParameters;
  /** The optimisation target shared by the scheduler and the progress bar. */
  examObjective: ExamObjective;
  /**
   * Maximum number of brand-new cards to introduce per day during study.
   * Undefined or 0 means unlimited (the default; preserves prior behaviour).
   */
  newCardsPerDay?: number;
  /**
   * Maximum number of reviews (including re-reviews) to serve per day for this deck.
   * Undefined or 0 means unlimited (the default).
   */
  maxReviewsPerDay?: number;
  /**
   * When true the deck is archived: retained in full but hidden from active study,
   * the global "Today" session and the dashboard's study denominators. Used as one
   * of the explicit choices once an exam date has passed.
   */
  archived?: boolean;
  /**
   * Per-deck override for automatic FSRS parameter optimisation. When undefined the
   * global default applies; false opts this deck out even when the global default is on.
   */
  autoOptimise?: boolean;
  /** Optional deck colour used for visual identification in the dashboard and sidebar. */
  colour?: string;
  /** Epoch ms of the most recent review (or deck creation), for dashboard priority. */
  lastInteractedAt?: number;
  /**
   * Optional folder id for grouping decks. Null or undefined means the deck is
   * at the top level (not in any folder).
   */
  folderId?: string | null;
  /**
   * Ownership metadata for an internal course backing deck. These fields are
   * optional so existing databases and exported backups remain compatible.
   * `backingLessonId` is null for the course question-bank deck.
   */
  backingCourseId?: string;
  backingLessonId?: string | null;
  /**
   * Number of lapses at which a card is treated as a leech. When undefined, the
   * global default of 8 is used.
   */
  leechThreshold?: number;
  /**
   * What to do automatically when a card crosses the leech threshold during review.
   * 'suspend' — auto-suspend the card (default).
   * 'tag' — add a 'leech' tag.
   * 'none' — surface the badge only, take no action.
   */
  leechAction?: 'suspend' | 'tag' | 'none';
  /**
   * Target number of cards to review per day for this deck. When set, the session
   * ends with a "Daily goal reached" message once the count is hit. Undefined or 0
   * means no daily goal.
   */
  dailyReviewGoal?: number;
  /**
   * Maximum number of minutes a single study session may run for this deck.
   * When set, the session ends gracefully once the time limit is exceeded.
   * Undefined or 0 means no time limit.
   */
  sessionTimeLimitMinutes?: number;
}

/** A Deck row from a backup predating the current FSRS schema. */
export type LegacyDeck = Omit<
  LegacyDeckRecord,
  'fsrsVersion' | 'fsrsParameters' | 'examObjective'
> &
  Partial<Pick<LegacyDeckRecord, 'fsrsVersion' | 'fsrsParameters' | 'examObjective'>>;

/** A folder for grouping decks hierarchically. */
export interface LegacyFolder {
  id: string;
  name: string;
  /** Parent folder id, or null for a top-level folder. */
  parentId: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Course architecture (Course -> Lesson -> Note + Card).
//
// These are the live domain tables. Schema v22 removed the hidden Deck and
// Folder stores. LegacyDeckRecord and LegacyFolder remain as the Dexie
// upgrade, snapshot-builder and test-fixture shape; they are not live stores
// and are no longer an import boundary.
// Field shapes follow the resolved design in new_features_list.md (main plan
// plus addenda). British English.
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
  id: string;
  name: string;
  description: string;
  examBoard?: string;
  specification?: string;
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
   * lineage's origin, not a copy of it (Arc 7 §7.2).
   */
  distribution?: { lineageId: string; revision: number; publishedAt: number };
}

/** A student's distributed-copy tracking on an imported `Course` (Arc 7 §7.2). */
export interface CourseDistributedCopy {
  /** Matches the teacher's `Course.distribution.lineageId`. */
  lineageId: string;
  /** Last-imported/merged revision number. */
  revision: number;
  /** True unless the student has detached from the lineage. */
  locked: boolean;
  /** Whether non-conflicting updates apply automatically on re-import. Default false. */
  autoAcceptUpdates: boolean;
  /** Optional "shared by" display string, mirrors `by` in `SharePayloadV2`. */
  sourceLabel?: string;
}

/**
 * Hydrated course view used by existing scheduling consumers during the assessment
 * migration. The compatibility date fields are derived from the course's one final
 * assessment and are never persisted on the course row.
 */
export interface Course extends CourseRecord {
  readonly examDate: number;
  readonly timeZone?: string;
}

export type AssessmentKind = 'final' | 'checkpoint';

interface CourseAssessmentBase {
  id: string;
  courseId: string;
  name: string;
  kind: AssessmentKind;
  /** Assessment date/time as epoch milliseconds in UTC. */
  examDate: number;
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
  ({ coverageMode: 'prefix'; lessonIds?: never } | { coverageMode: 'custom'; lessonIds: string[] });

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

/**
 * Named preset identifiers offered by the sequence editor (`src/db/sequencePresets.ts`).
 * Kept here, rather than on the presets module, so `Sequence.presetId` doesn't create a
 * types <-> sequencePresets import cycle.
 */
export type SequencePresetId = 'list' | 'poetry' | 'script' | 'speech' | 'procedure' | 'timeline';

/**
 * An overlapping-cloze sequence: an ordered list of small recallable units
 * (e.g. a numbered list, a chain of steps, or a scripted scene) from which
 * generation logic derives ordinary FSRS cards, each cueing on the preceding
 * `cueWindow` items. Sequences themselves are not studied directly.
 */
export interface Sequence {
  id: string;
  courseId: string;
  /** Same semantics as Card.primaryLessonId. */
  primaryLessonId: string | null;
  name: string;
  description?: string;
  /**
   * `list` (default, undefined reads as `list`): every item generates a
   * positional recall card. `lines`: items are speaker-tagged script lines;
   * only `mySpeaker`'s lines generate recall cards, and other speakers'
   * lines serve purely as cue context (see `mySpeaker`).
   */
  mode?: 'list' | 'lines';
  /** Ordered; stored inline as sequences are small. */
  items: SequenceItem[];
  /** Preceding items shown as cue. Default 2. */
  cueWindow: number;
  /** Optional named chunks; items reference one by index. */
  chunkLabels?: string[];
  /** Toggle for label -> value cards. Default off. */
  generateLabelCards?: boolean;
  /**
   * `lines` mode only: the speaker whose lines are the recall target. Matched
   * against `SequenceItem.speaker`. A sequence-level flag rather than a
   * per-item one, since one speaker is "mine" for the whole scene — consistent
   * with `cueWindow`/`chunkLabels` already being sequence-level settings.
   */
  mySpeaker?: string;
  /**
   * Which named preset (`src/db/sequencePresets.ts`) the author picked at creation —
   * data-only, purely for redisplaying the right terminology/picker state when editing;
   * `mode`/`cueWindow`/`mySpeaker` above remain the fields generation actually reads.
   * Undefined for sequences created before presets existed, or if a future preset is
   * removed; falls back to inferring from `mode` (see `presetForSequence`).
   */
  presetId?: SequencePresetId;
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
}

/** A single recallable unit within a Sequence. */
export interface SequenceItem {
  /** Stable across edits — anchors generated cards. */
  id: string;
  /** Markdown; the recallable unit. */
  value: string;
  /** Optional display key (e.g. "11" for Sodium). */
  label?: string;
  /** Membership of a named chunk. */
  chunkIndex?: number;
  /** `lines` mode only: who speaks this line (e.g. a character name). */
  speaker?: string;
}

/**
 * One masked region on an occlusion diagram; anchors exactly one generated card.
 * `x`/`y`/`w`/`h` are fractions of image width/height in 0..1, never pixels — this
 * keeps masks positioned correctly under responsive image sizing.
 */
export interface OcclusionRegion {
  /** Stable across edits; anchors one generated card. */
  id: string;
  role: 'label' | 'feature';
  /** v1 only; explicit for forward-compatible geometry. */
  shape: 'rectangle';
  /** Fraction of image width, 0..1. */
  x: number;
  /** Fraction of image height, 0..1. */
  y: number;
  /** Fraction of image width, 0..1. */
  w: number;
  /** Fraction of image height, 0..1. */
  h: number;
  /** Optional; required only for typed mode and unpaired features. */
  answerText?: string;
  /** feature -> the label region that answers it. */
  pairedRegionId?: string;
  /** Optional extra shown on the back. */
  backNote?: string;
}

/**
 * An image occlusion set: a diagram plus masked regions from which generation logic
 * derives one card per region. Occlusions themselves are not studied directly.
 */
export interface Occlusion {
  id: string;
  courseId: string;
  /** Same semantics as Card.primaryLessonId. */
  primaryLessonId: string | null;
  name: string;
  /** The diagram. */
  assetHash: string;
  /** Ordered; stored inline as occlusions are small. */
  regions: OcclusionRegion[];
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
}

/** A learning unit on the course path: notes plus the cards taught in it. */
export interface Lesson {
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
  type: 'auto' | 'manual';
  /** Only meaningful for `manual`; `auto` nodes are positioned at render time. */
  position?: number;
  name: string;
  /** Which lessons' cards to include; undefined = the whole course. */
  lessonIds?: string[];
  filters?: CardFilter[];
  /** Limit the session to N cards. */
  cardCount?: number;
  randomize?: boolean;
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
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

/**
 * One scored line within a mark scheme (`ItemPayload` kind `'working'`), and — once
 * `scaffold` is built — expected to double as the per-hole check there too, rather
 * than inventing a second grammar (see the deferral note on `ItemPayload`).
 * `kind: 'waypoint'` checks equivalence of a checkpoint expression (order-tolerant:
 * a student's lines are matched against outstanding waypoints, not lockstep);
 * `kind: 'predicate'` checks a named predicate against the student's line. See
 * docs/archive/roadmap-2026-08-11.md §11.4/§11.5.
 */
export type MarkSchemeLine = SharedMarkSchemeLine;

/**
 * A numeric answer specification for `ItemPayload` kind `'numeric'`: exact value,
 * value-with-tolerance, or match-one-of. See docs/archive/roadmap-2026-08-11.md §11.2/§11.4.
 */
export type NumericAnswerSpec = SharedNumericAnswerSpec;

/**
 * A pinned sample answer used by the tutor's test harness (docs/archive/roadmap-2026-08-11.md §11.6) to
 * regression-test a mark scheme or numeric spec on every edit. Fixtures travel in
 * the payload so a shared item carries its own tests.
 */
export type ItemFixture = SharedItemFixture;

/**
 * The current `ItemPayload.v`. Single source of truth for "known version" checks at
 * study time (`useLearnSession`'s `hasMachineMarkedPayload`) and at share/backup
 * validation time (`db/share.ts`'s `KnownItemPayloadSchema`) — see docs/archive/roadmap-2026-08-11.md
 * §11.2 rule 3.
 */
export { CURRENT_ITEM_PAYLOAD_VERSION } from '../items/types';

/**
 * Structured content for a practice item's kind, layered on top of `Card.front`
 * (which remains the Markdown question prompt, and doubles as the plain-text
 * fallback rendering for clients that don't understand the payload — docs/archive/roadmap-2026-08-11.md
 * §11.2 rule 1: no smuggling, structured content never lives in `front`). Absent on
 * every pre-Arc-11 card and on the four classic `CardType`s. Versioned independently
 * of the Dexie schema (`v`) so share codes and backups can validate
 * forward-compatibly: an unknown `v` or `kind` must render read-only with the
 * `front` fallback, never crash and never mis-mark (docs/archive/roadmap-2026-08-11.md §11.2 rule 3; the
 * fallback itself is `UnknownItemFace`).
 *
 * `scaffold` is declared but not built in Arc 11 slice 1 (deferred — see
 * `.agent-mail/arc11-slice1-plan.md`'s "Deferrals" section). Its eventual payload
 * is expected to reuse `MarkSchemeLine` per hole rather than invent a second
 * grammar, so the slot is reserved now instead of this union being reopened later.
 */
export type ItemPayload = SharedItemPayload;

export interface Card {
  id: string;
  /** Stable knowledge identity shared by alternate Card presentations. Required after schema v24. */
  conceptId: string;
  /** Legacy import provenance only. Runtime ownership uses schedulingUnitId. */
  deckId?: string;
  /**
   * The Course this card belongs to. Populated during the course migration and
   * for cards created through the course UI; null/undefined for legacy cards that
   * have only a deck. The FSRS engine schedules a course's cards by this id.
   */
  courseId?: string | null;
  /**
   * The Lesson where this card was created. Null when the card is unassigned
   * (e.g. created in the question bank). Drives exam-date resolution overrides.
   */
  primaryLessonId?: string | null;
  type: CardType;
  /** Markdown source. For cloze cards this contains the {{cN::...}} notation. */
  front: string;
  /** Markdown source for the answer side. Unused (empty) for cloze cards. */
  back: string;
  /**
   * Per-type structured content for practice item kinds (numeric/scaffold/working;
   * Arc 11). Absent on every pre-Arc-11 card and on the four classic `CardType`s.
   * Unindexed and optional, so no Dexie schema version bump is needed to add it —
   * see `ItemPayload`'s doc comment and docs/archive/roadmap-2026-08-11.md §11.2.
   */
  payload?: ItemPayload;
  /** FSRS stability in days (interval at which R = 0.90). Null until first review. */
  stability: number | null;
  /** FSRS difficulty in [1, 10]. Null until first review. */
  difficulty: number | null;
  /** Epoch ms of the last review (= ts-fsrs `last_review`). Null until first review. */
  lastReviewed: number | null;
  /** Number of reviews so far (= ts-fsrs `reps`). */
  reps: number;
  /** Number of lapses (failed reviews) so far (= ts-fsrs `lapses`). */
  lapses: number;
  /** Current FSRS memory state (= ts-fsrs `state`). */
  state: FsrsCardState;
  /** Free-text tags for organising and filtered study. Optional; defaults to []. */
  tags?: string[];
  /** When true the card is withheld from all study and from progress/objective. */
  suspended?: boolean;
  /** User-set marker for quick filtering and follow-up. Optional; defaults to false. */
  flagged?: boolean;
  /** Epoch ms until which the card is buried (skipped). null/absent when not buried. */
  buriedUntil?: number | null;
  /** Id of the reverse card in a basic_reversed pair. Only set when type is 'basic_reversed'. */
  reverseCardId?: string | null;
  /** Id of the SequenceItem this card was generated from. Present iff the card was generated from a sequence item. */
  sequenceItemId?: string;
  /** Id of the OcclusionRegion this card was generated from. Present iff the card was generated from an occlusion region. */
  occlusionRegionId?: string;
  /** Required after schema v22; optional only while parsing legacy payloads. */
  schedulingUnitId: string;
  /** Epoch ms of the next scheduled review (= ts-fsrs `due`). Null until first review. */
  due: number | null;
  /** Days ts-fsrs last scheduled this card for (= ts-fsrs `scheduled_days`). */
  scheduledDays: number;
  /** Current position within the (re)learning steps (= ts-fsrs `learning_steps`). */
  learningSteps: number;
  history: ReviewLog[];
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt or lastReviewed. */
  updatedAt: number;
}

/** A sampled snapshot of a deck's predicted exam-day retrievability for historical charts. */
export interface SessionHistoryEntry {
  id?: number;
  /** Links this aggregate to the ReviewLog without relying on the auto-increment id. */
  eventId?: string;
  sessionId?: string;
  revisionPlanId?: string;
  revisionWindowId?: string;
  timestamp: number;
  deckId: string;
  /** The Course this entry belongs to, once sessions are course-scoped. */
  courseId?: string;
  /** Explicit Course/Lesson scheduling unit for the trajectory sample. */
  schedulingUnitId?: string;
  averagePredictedRetrievability: number;
}

/** Per-deck calibration profile for the invisible rating engine (Welford online stats). */
export interface UserPerformance {
  deckId: string;
  /** The Course this profile belongs to, once calibration is course-scoped. */
  courseId?: string;
  runningMeanResponseTime: number;
  /** Running standard deviation (derived from the M2 aggregate). */
  runningStdDevResponseTime: number;
  /** Welford aggregate of squared distances from the mean. */
  m2: number;
  totalCorrectReviews: number;
}

/** The physical scheduling unit introduced by the domain-storage migration. */
export type SchedulingUnitKind = 'course' | 'lesson' | 'legacy-deck';

/** Course/Lesson-owned scheduling configuration, replacing hidden backing Deck ownership. */
export interface SchedulingUnitRecord extends SchedulerConfig {
  /** Source record creation time, retained for deterministic merge resolution. */
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt or lastInteractedAt. */
  updatedAt: number;
  /** Whether the source has answered or dismissed the exam-date prompt. */
  examDatePromptDismissed?: boolean;
  /** FSRS parameter schema version retained as target-store provenance. */
  fsrsVersion: number;
  kind: SchedulingUnitKind;
  courseId: string | null;
  lessonId: string | null;
  name: string;
  timeZone?: string;
  autoOptimise?: boolean;
  dailyReviewGoal?: number;
  sessionTimeLimitMinutes?: number;
  colour?: string;
  lastInteractedAt?: number;
}

interface PerformanceStats {
  runningMeanResponseTime: number;
  runningStdDevResponseTime: number;
  m2: number;
  totalCorrectReviews: number;
}

/** Course-keyed calibration profile in the target storage model. */
export interface CoursePerformance extends PerformanceStats {
  courseId: string;
  /** Last mutation time. Required after schema v23; backfilled to 0 when unknown. */
  updatedAt: number;
}

/** Scheduling-unit-keyed pacing profile in the target storage model. */
export interface SchedulingPerformance extends PerformanceStats {
  schedulingUnitId: string;
  courseId?: string;
  lessonId?: string;
  /** Last mutation time. Required after schema v23; backfilled to 0 when unknown. */
  updatedAt: number;
}

/** Binary media asset stored separately from card Markdown and deduplicated by hash.
 *  We store the raw bytes as Uint8Array because fake-indexeddb (and some browser
 *  IndexedDB implementations) do not reliably preserve Blob objects through
 *  structuredClone.  DOM APIs that need a Blob receive one via `toBlob()`. */
export interface MediaAsset {
  hash: string;
  blob: Blob | Uint8Array;
  mimeType: string;
  /** Absent on pre-Arc-6 records and therefore interpreted as image. */
  kind?: 'image' | 'audio';
  width?: number;
  height?: number;
  createdAt: number;
}

/** JSON-safe form of a MediaAsset for backups and exports. */
export interface BackupAsset {
  hash: string;
  data: string;
  mimeType: string;
  kind?: 'image' | 'audio';
  width?: number;
  height?: number;
  createdAt: number;
}

/** A timestamped automatic snapshot of the whole database, kept as a restore point. */
export interface BackupSnapshot {
  id?: number;
  createdAt: number;
  /**
   * Optional marker. 'pre-migration' snapshots are taken automatically before a
   * schema upgrade and are exempt from the normal daily-snapshot pruning, so a
   * botched migration always has a restore point to fall back to.
   */
  tag?: 'pre-migration';
  /** Denormalised counts so the restore-point list can be shown without parsing the payload. */
  deckCount: number;
  cardCount: number;
  /** The full backup payload, identical in shape to a manual export. */
  payload: BackupFile;
}

/** Generic key/value store for small persistent app state (e.g. the backup folder handle). */
export interface AppStateEntry {
  key: string;
  value: unknown;
}

/** One deleted snapshot-carried row, kept so a peer merge can honour the deletion. */
export interface Tombstone {
  /** Dexie table name, e.g. `cards` or `courses`. */
  table: string;
  recordId: string;
  deletedAt: number;
}

export type AgentMemoryTag =
  | 'misconception'
  | 'plateau'
  | 'preference'
  | 'session'
  | 'strength'
  | 'context';

export type AgentMemoryStatus = 'active' | 'uncertain' | 'resolved';
export type AgentMemoryBasis = 'learner-stated' | 'agent-inferred' | 'observed-performance';
export type AgentMemoryReferenceKind = 'card' | 'concept' | 'lesson' | 'question' | 'course';

export interface AgentMemoryReference {
  kind: AgentMemoryReferenceKind;
  id: string;
  /** Historical display snapshot. The entity id remains authoritative. */
  label: string;
}

export interface AgentMemoryProvenance {
  conversationId?: string;
  messageId?: string;
  agentId?: string;
}

/** Learner-correctable teaching context owned by either the learner globally or one Course. */
export interface AgentMemory {
  id: string;
  courseId: string | null;
  tags: AgentMemoryTag[];
  status: AgentMemoryStatus;
  content: string;
  references: AgentMemoryReference[];
  basis: AgentMemoryBasis;
  provenance?: AgentMemoryProvenance;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Unwrapped channel key and write token kept on this device so sync works
 * without re-entering the recovery passphrase. Cleared by the Settings Lock
 * action; the wrapped keybag remains for pairing fresh devices.
 */
export interface RememberedSyncCredentials {
  /** Hex-encoded channel key. */
  channelKeyHex: string;
  writeToken: string;
}

/**
 * Local sync-channel bookkeeping. Stored under `appState` key `syncState`.
 * Absent until a device is paired; the P6 Settings flow owns pairing and
 * stores the relay origin, wrapped recovery copy and optional remembered
 * credentials here.
 */
export interface SyncState {
  /** Relay origin used by this device to reach the channel. */
  relayUrl?: string;
  channelId?: string;
  /** Hex-encoded passphrase-wrapped channel key and write token. */
  wrappedKeyMaterial?: string;
  /** Present while this device remembers its credentials without the passphrase. */
  remembered?: RememberedSyncCredentials;
  lastPushedGeneration?: string;
  lastSuccessfulSyncAt?: number;
  /** Last encrypted snapshot size, retained for the Settings sync status panel. */
  lastSnapshotBytes?: number;
  /** Last JSON snapshot size before encryption. */
  lastSnapshotPlaintextBytes?: number;
  lastError?: string | null;
}

/** Shape of an exported/imported backup file. */
export interface BackupFile {
  app: 'lacuna';
  version: number;
  exportedAt: number;
  /** Pre-v22 Deck rows. Current exports omit this; a non-empty array is refused. */
  decks?: LegacyDeck[];
  cards: Card[];
  /** Question-mode domain records. Optional on backup versions before v11. */
  concepts?: Concept[];
  questions?: QuestionDefinition[];
  questionConcepts?: QuestionConceptSet[];
  questionAttempts?: QuestionAttempt[];
  /** Durable AI teaching context. Optional so existing v11 backups remain valid. */
  agentMemories?: AgentMemory[];
  /** Canonical review events when exported from schema v20 or later. */
  reviewHistory?: ReviewHistoryEntry[];
  /** Target storage projections, optional while old backups are imported. */
  schedulingUnits?: SchedulingUnitRecord[];
  coursePerformance?: CoursePerformance[];
  schedulingPerformance?: SchedulingPerformance[];
  assets: BackupAsset[];
  sessionHistory: SessionHistoryEntry[];
  userPerformance: UserPerformance[];
  /** Pre-v22 Folder rows. Current exports omit this; a non-empty array is refused. */
  folders?: LegacyFolder[];
  // Course architecture tables. Optional so older backups still import cleanly.
  courses?: CourseRecord[];
  lessons?: Lesson[];
  notes?: Note[];
  lessonCards?: LessonCardLink[];
  lessonCardExposures?: LessonCardExposure[];
  lessonCompletions?: LessonCompletion[];
  practiceNodes?: PracticeNode[];
  practiceMilestones?: PracticeMilestone[];
  /** Full assessment records in current backups. */
  courseAssessments?: CourseAssessment[];
  revisionPlans?: RevisionPlan[];
  /** Legacy v6-and-earlier import boundary. Never emitted by current exports. */
  courseExamDates?: AssessmentDateCompatibility[];
  // Overlapping-cloze sequences. Optional so older backups still import cleanly.
  sequences?: Sequence[];
  // Image occlusions. Optional so older backups still import cleanly.
  occlusions?: Occlusion[];
  /**
   * Deletion receipts. Optional so pre-v10 backups import unchanged; an absent
   * array means none. Added at backup version 10 / schema v23.
   */
  tombstones?: Tombstone[];
  /** Distributed-course merge state, included from backup v11 onwards. */
  lineageIdMappings?: LineageIdMapping[];
  pendingMergeReviews?: PendingMergeReview[];
}

/**
 * Adopted-id membership registry for one distributed course lineage (Arc 7 §7.2).
 * Not a translation table — adopted ids and local ids are the same value, since a
 * student's merge import adopts a teacher's originating ids directly rather than
 * generating fresh local ones. Created on first import of a lineage and consulted
 * (never mutated except to add newly-created entities) by every subsequent merge.
 */
export interface LineageIdMapping {
  /** = lineageId; one row per distributed course. */
  id: string;
  /** The local `Course` this mapping belongs to. */
  courseId: string;
  /** Originating lesson ids already adopted as local ids. */
  lessonIds: string[];
  /** Originating note ids already adopted as local ids. */
  noteIds: string[];
  /** Originating card ids already adopted as local ids. */
  cardIds: string[];
  /** Originating Concept ids carried by v3 course shares. */
  conceptIds?: string[];
  /** Originating Question ids carried by v3 course shares. */
  questionIds?: string[];
  /** Originating sequence ids already adopted as local ids. */
  sequenceIds: string[];
  /** Originating occlusion ids already adopted as local ids. Absent on mappings written
   *  before image occlusion existed, so readers must tolerate `undefined`. */
  occlusionIds?: string[];
  /**
   * Last-merged content snapshot for every adopted lesson/note/card, keyed by local
   * (= originating) id. `src/db/mergeImport.ts` compares an entity's *current* local
   * content against its snapshot here to detect a student edit since the last merge
   * (Arc 7 §7.10's third risk: snapshot comparison over a separate dirty flag, so
   * there is no second field that can drift out of sync with reality). Populated with
   * the just-applied content on every successful first import or merge — including for
   * entities the student's own edit left untouched, since "untouched" is exactly what a
   * matching snapshot records. Extends the v18 shape in place (Lacuna is pre-release,
   * see docs/archive/roadmap-2026-08-11.md §7 Task 5 notes) rather than a schema bump, since no index is
   * needed for these fields.
   */
  lessonSnapshots: Record<string, LineageLessonSnapshot>;
  noteSnapshots: Record<string, LineageNoteSnapshot>;
  cardSnapshots: Record<string, LineageCardSnapshot>;
}

/** The subset of a Lesson's fields `lineageDiff.ts` diffs on, captured for student-edit detection. */
export interface LineageLessonSnapshot {
  name: string;
  description?: string;
  isExtension: boolean;
  releaseDate?: number;
  examDate?: number;
  timeZone?: string;
  sessionFilter?: 'new' | 'due' | 'mixed';
  orderIndex: number;
}

/** The subset of a Note's fields `lineageDiff.ts` diffs on. */
export interface LineageNoteSnapshot {
  name: string;
  content: string;
  orderIndex: number;
}

/** The subset of a Card's fields `lineageDiff.ts` diffs on — content only, never FSRS fields. */
export interface LineageCardSnapshot {
  type: CardType;
  front: string;
  back: string;
  tags?: string[];
  /** Content only, never FSRS state — same rule as the rest of this snapshot (Arc 11). */
  payload?: ItemPayload;
}

/**
 * A queued merge decision awaiting student review (Arc 7 §7.2/§7.5). One row per
 * merge import; a new merge for the same course supersedes rather than appends to
 * the previous pending row, so the table never accumulates a history. The `diff`
 * shape reuses `src/db/lineageDiff.ts`'s update/conflict types directly (Arc 7
 * §7.3) rather than a hand-duplicated `Partial<...>` shape, so the two cannot
 * drift apart; `creates` are never persisted here since `mergeImport.ts` applies
 * them immediately and unconditionally (Arc 7 §7.5 step 2) — the array is always
 * empty when this row is written, but keeps the full entity shape so a future
 * caller is not surprised by a narrower type.
 */
export interface PendingMergeReview {
  /** Generated review id (primary key). */
  id: string;
  /** The local `Course` this review belongs to. */
  courseId: string;
  /** The lineage this merge came from; matches `CourseDistributedCopy.lineageId`. */
  lineageId: string;
  /** The incoming revision this diff corresponds to. */
  revision: number;
  diff: {
    creates: { lessons: Lesson[]; notes: Note[]; cards: Card[] };
    updates: {
      lessons: LessonUpdate[];
      notes: NoteUpdate[];
      cards: CardUpdate[];
    };
    removals: { lessonIds: string[]; noteIds: string[]; cardIds: string[] };
    /**
     * `LineageConflict` covers a content clash (both sides changed the same entity).
     * `mergeImport.ts` also queues a second, narrower kind here — a teacher removal of
     * an entity the student has edited (§7.10's unresolved-in-planning policy: treat as
     * a conflict, student's copy retained until they accept the removal) — which has no
     * incoming content to attach, hence `incoming: null` rather than reusing
     * `LineageConflict`'s non-null `incoming`.
     */
    conflicts: Array<
      LineageConflict | { entityId: string; kind: 'lesson' | 'note' | 'card'; incoming: null }
    >;
  };
  createdAt: number;
}
