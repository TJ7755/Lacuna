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
import { applyReview, makeEngine } from '@lacuna/core/fsrs/fsrs';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { applyScheduleEdit, mergeScheduleEdits } from '../db/scheduleEdits';
import type { NormalisedSnapshot } from './snapshotRecords';
import { canonicalJson, sortById } from './snapshotIdentity';

const NEVER_REVIEWED = {
  stability: null,
  stabilityFast: null,
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

function hasCompleteReviewPrefix(card: Card, events: readonly ReviewHistoryEntry[]): boolean {
  return (
    events[0]?.stabilityBefore === null &&
    (events[0]?.memoryOrigin?.reps ?? 0) === 0 &&
    events.length >= card.reps &&
    (events.at(-1)?.timestamp ?? -Infinity) >= (card.lastReviewed ?? -Infinity)
  );
}

/** A reset supplies a new memory origin even when the earlier history was lost. */
export function hasCompleteMemoryHistory(
  card: Card,
  events: readonly ReviewHistoryEntry[],
): boolean {
  if (card.lastReviewed === null) return card.state === 0;
  // Complete pre-reset evidence still replays: offline answers can legitimately
  // carry the memory from before a reset they had not yet received.
  const chronological = [...events].sort((a, b) => a.timestamp - b.timestamp);
  if (hasCompleteReviewPrefix(card, chronological)) return true;
  const originIndex = chronological.findIndex((event) => event.memoryOrigin);
  if (originIndex >= 0) {
    const origin = chronological[originIndex].memoryOrigin!;
    return (
      origin.reps + chronological.length - originIndex >= card.reps &&
      (chronological.at(-1)?.timestamp ?? -Infinity) >= card.lastReviewed
    );
  }
  const reset = card.scheduleEdits?.filter((edit) => edit.kind === 'reset').at(-1);
  const ordered = chronological.filter((event) => !reset || event.timestamp > reset.at);
  if (
    ordered[0]?.stabilityBefore !== null ||
    (ordered.at(-1)?.timestamp ?? -Infinity) < card.lastReviewed
  )
    return false;
  // Resets retain lifetime counters, so a missing prefix or tail is still incomplete.
  if (events.length < card.reps) return false;
  return (
    !reset ||
    ordered.every(
      (event, index) => index === 0 || event.stabilityBefore === ordered[index - 1].stabilityAfter,
    )
  );
}

export function replayCards(
  cards: Card[],
  reviewHistory: ReviewHistoryEntry[],
  units: SchedulingUnitRecord[],
  courses: CourseRecord[],
  options: { preserveSchedule?: boolean } = {},
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
    // Complete evidence includes offline reviews absent from a later reset origin.
    // Only fall back to an origin when the lifetime prefix cannot be reconstructed.
    const originIndex = hasCompleteReviewPrefix(card, events)
      ? -1
      : events.findIndex((event) => event.memoryOrigin);
    const origin = originIndex >= 0 ? events[originIndex].memoryOrigin : undefined;
    if (originIndex > 0) events.splice(0, originIndex);
    let current: Card = {
      ...card,
      ...NEVER_REVIEWED,
      ...origin,
      scheduleEdits: card.scheduleEdits,
    };
    // Only edits explicitly captured by the origin are already represented. An
    // offline device can contribute an older reset that the answering device never saw.
    const representedEdits = new Set((origin?.scheduleEdits ?? []).map(canonicalJson));
    // The card log compacts older resets; immutable origins retain the edits
    // needed to replay earlier answers without inventing lifetime lapses.
    const recordedEdits = [
      ...(card.scheduleEdits ?? []),
      ...events.flatMap((event) => event.memoryOrigin?.scheduleEdits ?? []),
    ];
    const edits = [...new Map(recordedEdits.map((edit) => [canonicalJson(edit), edit])).values()]
      .filter((edit) => !origin || !representedEdits.has(canonicalJson(edit)))
      .sort((a, b) => a.at - b.at || canonicalJson(a).localeCompare(canonicalJson(b)));
    const complete = hasCompleteMemoryHistory(card, events);
    // A learnt import without its event prefix is opaque, never a new card.
    if (!complete) {
      current = { ...card, stabilityFast: card.stabilityFast ?? null };
      const engine = makeEngine(parametersForCard(card, unitById, courseById));
      for (const event of events) {
        if (event.timestamp > (card.lastReviewed ?? -Infinity)) {
          current = {
            ...current,
            ...applyReview(engine, current, event.grade, event.timestamp).memory,
          };
        }
      }
      for (const edit of edits) {
        if (edit.at >= (card.lastReviewed ?? -Infinity)) current = applyScheduleEdit(current, edit);
      }
      return current;
    }
    if (events.length === 0 && edits.length === 0) return current;
    const params = parametersForCard(card, unitById, courseById);
    // Use the live parameters, fuzz included: ts-fsrs seeds fuzz from the review time
    // and memory state, so replay stays deterministic and matches the live schedule.
    const engine = makeEngine(params);
    // Timestamp ties place edits after an answer unless its immutable origin
    // explicitly records that the edit had already happened.
    const pendingEdits = [...edits];
    let nextEdit = 0;
    for (const event of events) {
      while (nextEdit < pendingEdits.length && pendingEdits[nextEdit].at < event.timestamp) {
        current = applyScheduleEdit(current, pendingEdits[nextEdit++]);
      }
      if (event.memoryOrigin?.scheduleEdits?.length) {
        let end = nextEdit;
        while (end < pendingEdits.length && pendingEdits[end].at === event.timestamp) end += 1;
        const witnessed = new Set(event.memoryOrigin.scheduleEdits.map(canonicalJson));
        const deferred = [];
        for (const edit of pendingEdits.splice(nextEdit, end - nextEdit)) {
          if (witnessed.has(canonicalJson(edit))) current = applyScheduleEdit(current, edit);
          else deferred.push(edit);
        }
        pendingEdits.splice(nextEdit, 0, ...deferred);
      }
      const { memory } = applyReview(engine, current, event.grade, event.timestamp);
      current = { ...current, ...memory };
    }
    while (nextEdit < pendingEdits.length) {
      current = applyScheduleEdit(current, pendingEdits[nextEdit++]);
    }
    // The first answer after a reset has no prior stability when it saw the reset.
    // A non-null receipt proves an offline answer needs the newly merged reset applied.
    const unseenReset = edits.some((edit) => {
      if (edit.kind !== 'reset') return false;
      const answer = events.find((event) => event.timestamp > edit.at);
      return answer !== undefined && answer.stabilityBefore !== null;
    });
    const changedSchedule =
      unseenReset ||
      (origin
        ? edits.length > 0
        : edits.some(
            (edit) =>
              edit.at >= (card.lastReviewed ?? -Infinity) &&
              (edit.kind === 'reset' || edit.due !== card.due),
          ));
    if (
      options.preserveSchedule !== false &&
      !changedSchedule &&
      card.state === current.state &&
      card.learningSteps === current.learningSteps &&
      card.lastReviewed === current.lastReviewed &&
      current.reps <= card.reps
    ) {
      return {
        ...current,
        due: card.due,
        scheduledDays: card.scheduledDays,
        learningSteps: card.learningSteps,
        state: card.state,
        reps: card.reps,
        lapses: card.lapses,
      };
    }
    return {
      ...current,
      reps: Math.max(card.reps, current.reps),
      lapses: Math.max(card.lapses, current.lapses),
    };
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
