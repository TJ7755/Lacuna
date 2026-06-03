// Shared domain types for Lacuna's local data model.
// All persistence is via IndexedDB (see schema.ts). British English throughout.

export type CardType = 'front_back' | 'cloze';

/** FSRS grade: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy. */
export type Grade = 1 | 2 | 3 | 4;

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
}

export interface Card {
  id: string;
  deckId: string;
  type: CardType;
  /** Markdown source. For cloze cards this contains the {{cN::...}} notation. */
  front: string;
  /** Markdown source for the answer side. Unused (empty) for cloze cards. */
  back: string;
  stability: number | null;
  difficulty: number | null;
  lastReviewed: number | null;
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
