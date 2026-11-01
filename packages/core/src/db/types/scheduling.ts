import type { JevMarkProvenance } from '@lacuna/core/jev/types';

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
  'deck' | 'lesson' | 'practice' | 'assessment-revision' | 'revision-plan';

/** A single review event appended to a card's history. */
export interface ReviewLog {
  input?: 'typed' | 'reveal';
  markedBy?: JevMarkProvenance;
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
  /**
   * Whether this answer came within PRIMING_WINDOW_MS of an earlier answer to the same
   * card in the same session (see src/fsrs/primedReview.ts). Optional and additive:
   * absent on history written before this field existed, which reads as not primed.
   * The review still updates FSRS; only the short-term predictor discounts it.
   */
  primed?: boolean;
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
   * Marks earned/available for a machine-verified `numeric`/`working` item response. Optional and additive, matching the `hintUsed`/
   * `retrievabilityAtReview` precedent above — absent for classic-type reviews and
   * for history written before this field existed.
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
 * verbatim on `ReviewLog.lineVerdicts`. Declared here, ahead of
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
  /** Absent for steady-retention courses, which use a rolling maintenance horizon. */
  examDate?: number;
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
