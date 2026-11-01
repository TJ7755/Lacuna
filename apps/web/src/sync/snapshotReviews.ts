import type {
  Card,
  CourseRecord,
  FsrsParameters,
  Grade,
  SchedulingUnitRecord,
  SessionHistoryEntry,
} from '@lacuna/core/db/types';
import {
  cardsWithReviewHistory,
  mergeReviewHistoryEntries,
  type ReviewHistoryEntry,
} from '@lacuna/core/db/reviewHistory';
import { applyReview, makeEngine } from '../fsrs/fsrs';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { applyScheduleEdit, mergeScheduleEdits } from '../db/scheduleEdits';
import { canonicalJson, sortById, type NormalisedSnapshot } from './snapshotRecords';

const NEVER_REVIEWED = {
  stability: null,
  difficulty: null,
  lastReviewed: null,
  reps: 0,
  lapses: 0,
  state: 0 as const,
  due: null,
  scheduledDays: 0,
  learningSteps: 0,
  history: [] as Card['history'],
};

export function unionReviews(
  left: NormalisedSnapshot,
  right: NormalisedSnapshot,
): ReviewHistoryEntry[] {
  // Sort both arguments so merge(a, b) and merge(b, a) feed the helper the
  // same sequence. The helper already prefers canonical rows over card
  // projections; we only have to make that preference order-independent.
  const canonical = sortReviews([...left.reviewHistory, ...right.reviewHistory]);
  const cards = sortById([...left.cards, ...right.cards]);
  return mergeReviewHistoryEntries(canonical, cards);
}

function sortReviews(entries: ReviewHistoryEntry[]): ReviewHistoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    const event = (a.eventId ?? '').localeCompare(b.eventId ?? '');
    if (event !== 0) return event;
    const id = a.id.localeCompare(b.id);
    if (id !== 0) return id;
    return a.cardId.localeCompare(b.cardId);
  });
}

export function replayCards(
  cards: Card[],
  reviewHistory: ReviewHistoryEntry[],
  units: SchedulingUnitRecord[],
  courses: CourseRecord[],
): Card[] {
  const byCard = new Map<string, ReviewHistoryEntry[]>();
  for (const entry of reviewHistory) {
    const list = byCard.get(entry.cardId) ?? [];
    list.push(entry);
    byCard.set(entry.cardId, list);
  }
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const reset = cards.map((card) => {
    const events = (byCard.get(card.id) ?? [])
      .filter((entry) => isGrade(entry.grade))
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return reviewEventKey(a).localeCompare(reviewEventKey(b));
      });
    let current: Card = { ...card, ...NEVER_REVIEWED };
    const edits = card.scheduleEdits ?? [];
    if (events.length === 0 && edits.length === 0) return current;
    const params = parametersForCard(card, unitById, courseById);
    // Use the live parameters, fuzz included: ts-fsrs seeds fuzz from the review time
    // and memory state, so replay stays deterministic and matches the live schedule.
    const engine = makeEngine(params);
    // Manual reschedules and resets apply in time order between reviews; one made in
    // the same millisecond as a review came after it.
    let nextEdit = 0;
    for (const event of events) {
      while (nextEdit < edits.length && edits[nextEdit].at < event.timestamp) {
        current = applyScheduleEdit(current, edits[nextEdit++]);
      }
      const { memory } = applyReview(engine, current, event.grade, event.timestamp);
      current = { ...current, ...memory };
    }
    while (nextEdit < edits.length) current = applyScheduleEdit(current, edits[nextEdit++]);
    return current;
  });
  return cardsWithReviewHistory(reset, reviewHistory);
}

/** Keep every manual schedule edit either device made, whichever card row won. */
export function withUnionedScheduleEdits(cards: Card[], left: Card[], right: Card[]): Card[] {
  const leftById = new Map(left.map((card) => [card.id, card]));
  const rightById = new Map(right.map((card) => [card.id, card]));
  return cards.map((card) => {
    const edits = mergeScheduleEdits(
      leftById.get(card.id)?.scheduleEdits,
      rightById.get(card.id)?.scheduleEdits,
    );
    return edits ? { ...card, scheduleEdits: edits } : card;
  });
}

function parametersForCard(
  card: Card,
  unitById: Map<string, SchedulingUnitRecord>,
  courseById: Map<string, CourseRecord>,
): FsrsParameters {
  const unit = unitById.get(card.schedulingUnitId);
  if (unit) return unit.fsrsParameters;
  if (card.courseId) {
    const course = courseById.get(card.courseId);
    if (course) return course.fsrsParameters;
  }
  return defaultFsrsParameters();
}

function isGrade(value: unknown): value is Grade {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function reviewEventKey(entry: ReviewHistoryEntry): string {
  return entry.eventId ?? entry.id;
}

export function unionSessionHistory(
  left: SessionHistoryEntry[],
  right: SessionHistoryEntry[],
): SessionHistoryEntry[] {
  const merged = new Map<string, SessionHistoryEntry>();
  for (const row of [...left, ...right]) {
    const key = sessionHistoryKey(row);
    const stripped = stripSessionId(row);
    const existing = merged.get(key);
    if (!existing || canonicalJson(stripped) > canonicalJson(existing)) {
      merged.set(key, stripped);
    }
  }
  return [...merged.values()];
}

function sessionHistoryKey(entry: SessionHistoryEntry): string {
  return entry.eventId ? `event:${entry.eventId}` : `legacy:${entry.timestamp}:${entry.deckId}`;
}

function stripSessionId(entry: SessionHistoryEntry): SessionHistoryEntry {
  const { id: _id, ...rest } = entry;
  return rest;
}

export function sortSessionHistory(rows: SessionHistoryEntry[]): SessionHistoryEntry[] {
  return [...rows].sort((a, b) => sessionHistoryKey(a).localeCompare(sessionHistoryKey(b)));
}
