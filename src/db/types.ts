// Shared domain types for Lacuna's local data model.
// All persistence is via IndexedDB (see schema.ts). British English throughout.

export type CardType = 'front_back' | 'cloze';

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
 */
export interface FsrsParameters {
  w: number[];
  requestRetention: number;
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

/** A single review event appended to a card's history. */
export interface ReviewLog {
  timestamp: number;
  grade: Grade;
  /** Measured response time in seconds (time from reveal to "Show Answer"). */
  responseTimeSec: number;
  /** Whether the user lost focus while the answer was pending (report only; no grade effect). */
  distracted: boolean;
  stabilityBefore: number | null;
  stabilityAfter: number;
  difficultyBefore: number | null;
  difficultyAfter: number;
  /** Retrievability at the moment of review (null on a first review). */
  retrievabilityAtReview: number | null;
}

export interface Deck {
  id: string;
  name: string;
  /** Exam date/time as an epoch millisecond value. Defaults to creation + 7 days at 23:59 local. */
  examDate: number;
  createdAt: number;
  /** Set true once the user has set or dismissed the exam-date prompt with "don't ask again". */
  examDatePromptDismissed?: boolean;
  /** FSRS algorithm version this deck's parameters belong to (6 for FSRS-6). */
  fsrsVersion: number;
  /** The FSRS-6 parameter set used for every memory-state update in this deck. */
  fsrsParameters: FsrsParameters;
  /** The optimisation target shared by the scheduler and the progress bar. */
  examObjective: ExamObjective;
}

export interface Card {
  id: string;
  deckId: string;
  type: CardType;
  /** Markdown source. For cloze cards this contains the {{cN::...}} notation. */
  front: string;
  /** Markdown source for the answer side. Unused (empty) for cloze cards. */
  back: string;
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
  /** Epoch ms of the next scheduled review (= ts-fsrs `due`). Null until first review. */
  due: number | null;
  /** Days ts-fsrs last scheduled this card for (= ts-fsrs `scheduled_days`). */
  scheduledDays: number;
  /** Current position within the (re)learning steps (= ts-fsrs `learning_steps`). */
  learningSteps: number;
  history: ReviewLog[];
  createdAt: number;
}

/** A snapshot of a deck's predicted exam-day retrievability, written per answered card. */
export interface SessionHistoryEntry {
  id?: number;
  timestamp: number;
  deckId: string;
  averagePredictedRetrievability: number;
}

/** Per-deck calibration profile for the invisible rating engine (Welford online stats). */
export interface UserPerformance {
  deckId: string;
  runningMeanResponseTime: number;
  /** Running standard deviation (derived from the M2 aggregate). */
  runningStdDevResponseTime: number;
  /** Welford aggregate of squared distances from the mean. */
  m2: number;
  totalCorrectReviews: number;
}

/** Shape of an exported/imported backup file. */
export interface BackupFile {
  app: 'lacuna';
  version: number;
  exportedAt: number;
  decks: Deck[];
  cards: Card[];
  sessionHistory: SessionHistoryEntry[];
  userPerformance: UserPerformance[];
}
