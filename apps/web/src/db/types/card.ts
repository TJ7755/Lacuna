import type {
  ItemFixture as SharedItemFixture,
  ItemPayload as SharedItemPayload,
  MarkSchemeLine as SharedMarkSchemeLine,
  NumericAnswerSpec as SharedNumericAnswerSpec,
} from '../../items/types';
import type { AnswerMode } from './course';
import type { FsrsCardState, ReviewLog } from './scheduling';

export type CardType = 'front_back' | 'cloze' | 'basic_reversed';

/**
 * One scored line within a mark scheme (`ItemPayload` kind `'working'`), and — once
 * `scaffold` is built — expected to double as the per-hole check there too, rather
 * than inventing a second grammar (see the deferral note on `ItemPayload`).
 * `kind: 'waypoint'` checks equivalence of a checkpoint expression (order-tolerant:
 * a student's lines are matched against outstanding waypoints, not lockstep);
 * `kind: 'predicate'` checks a named predicate against the student's line.
 */
export type MarkSchemeLine = SharedMarkSchemeLine;

/**
 * A numeric answer specification for `ItemPayload` kind `'numeric'`: exact value,
 * value-with-tolerance, or match-one-of.
 */
export type NumericAnswerSpec = SharedNumericAnswerSpec;

/**
 * A pinned sample answer used by the tutor's test harness to
 * regression-test a mark scheme or numeric spec on every edit. Fixtures travel in
 * the payload so a shared item carries its own tests.
 */
export type ItemFixture = SharedItemFixture;

/**
 * Structured content for a practice item's kind, layered on top of `Card.front`
 * (which remains the Markdown question prompt, and doubles as the plain-text
 * fallback rendering for clients that don't understand the payload; structured content
 * never lives in `front`). Absent on
 * every pre-Arc-11 card and on the four classic `CardType`s. Versioned independently
 * of the Dexie schema (`v`) so share codes and backups can validate
 * forward-compatibly: an unknown `v` or `kind` must render read-only with the
 * `front` fallback, never crash and never mis-mark.
 *
 * `scaffold` is declared but not built in Arc 11 slice 1. Its eventual payload
 * is expected to reuse `MarkSchemeLine` per hole rather than invent a second
 * grammar, so the slot is reserved now instead of this union being reopened later.
 */
export type ItemPayload = SharedItemPayload;

export interface Card {
  /** Absent means inherit the lesson default; unassigned cards default to reveal. */
  answerMode?: AnswerMode;
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
   * see `ItemPayload`'s doc comment.
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
  /**
   * Manual reschedules and resets since the last reset, oldest first. Sync replays
   * them between reviews so a merge cannot undo them. Absent when there are none.
   */
  scheduleEdits?: ScheduleEdit[];
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt or lastReviewed. */
  updatedAt: number;
}

/** A manual schedule change at `at`: back to New, or a chosen due date. */
export type ScheduleEdit = { at: number; kind: 'reset' } | { at: number; kind: 'due'; due: number };
