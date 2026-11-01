import { describe, expect, it } from 'vitest';
import {
  reviewHistoryEntriesForCard,
  reviewHistoryEntryId,
  type ReviewHistoryEntry,
} from '@lacuna/core/db/reviewHistory';
import { applyReview, makeEngine } from '../fsrs/fsrs';

import {
  PARAMS,
  backup,
  course,
  card,
  review,
  historyEntry,
  tombstone,
  sample,
  expectPeerProperties,
} from './mergeSnapshots.testFixtures';

describe('peer review replay and schedule edits', () => {
  it('unions reviews from both devices and replays FSRS with the live parameters', () => {
    const first = review({ eventId: 'e1', timestamp: 1_000, grade: 3 });
    const second = review({ eventId: 'e2', timestamp: 2_000, grade: 4 });
    const a = backup({
      courses: [course('course-1')],
      cards: [
        card('c1', { history: [first], updatedAt: 1_000, stability: 3, lastReviewed: 1_000 }),
      ],
      reviewHistory: [historyEntry('c1', first)],
    });
    const b = backup({
      courses: [course('course-1')],
      cards: [
        card('c1', { history: [second], updatedAt: 2_000, stability: 8, lastReviewed: 2_000 }),
      ],
      reviewHistory: [historyEntry('c1', second)],
    });

    let expected = card('c1');
    const engine = makeEngine(PARAMS);
    expected = { ...expected, ...applyReview(engine, expected, 3, 1_000).memory };
    expected = { ...expected, ...applyReview(engine, expected, 4, 2_000).memory };

    const merged = expectPeerProperties(a, b);
    expect(merged.reviewHistory.map((entry) => entry.eventId).sort()).toEqual(['e1', 'e2']);
    expect(merged.cards[0].stability).toBe(expected.stability);
    expect(merged.cards[0].difficulty).toBe(expected.difficulty);
    expect(merged.cards[0].due).toBe(expected.due);
    expect(merged.cards[0].state).toBe(expected.state);
    expect(merged.cards[0].lastReviewed).toBe(expected.lastReviewed);
    expect(merged.cards[0].history).toEqual([]);
  });

  it('reproduces the live fuzzed schedule when merging a snapshot with itself', () => {
    // Live reviews use the unit's parameters, fuzz included. ts-fsrs seeds fuzz from the
    // review time and memory state, so replaying the same events must give the same due date.
    const engine = makeEngine(PARAMS);
    let live = card('c1');
    const entries: ReviewHistoryEntry[] = [];
    let now = 1_700_000_000_000;
    for (let index = 0; index < 4; index++) {
      const log = review({ eventId: `e${index}`, timestamp: now, grade: 3 });
      const { memory: next } = applyReview(engine, live, 3, now);
      live = { ...live, ...next, updatedAt: now };
      entries.push(historyEntry('c1', log));
      now = next.due;
    }
    const snapshot = backup({
      courses: [course('course-1')],
      cards: [live],
      reviewHistory: entries,
    });

    const merged = expectPeerProperties(snapshot, snapshot);
    expect(merged.cards[0].due).toBe(live.due);
    expect(merged.cards[0].scheduledDays).toBe(live.scheduledDays);
  });

  it('keeps a manual reset over earlier reviews from either device', () => {
    const first = review({ eventId: 'e1', timestamp: 1_000, grade: 3 });
    const unseen = review({ eventId: 'e2', timestamp: 2_000, grade: 4 });
    const a = backup({
      courses: [course('course-1')],
      cards: [
        card('c1', {
          updatedAt: 3_000,
          reps: 1,
          scheduleEdits: [{ at: 3_000, kind: 'reset' }],
        }),
      ],
      reviewHistory: [historyEntry('c1', first)],
    });
    const b = backup({
      courses: [course('course-1')],
      cards: [card('c1', { front: 'edited later', updatedAt: 4_000, stability: 8, reps: 1 })],
      reviewHistory: [historyEntry('c1', first), historyEntry('c1', unseen)],
    });

    const merged = expectPeerProperties(a, b);
    expect(merged.cards[0]).toMatchObject({
      front: 'edited later',
      state: 0,
      stability: null,
      due: null,
      lastReviewed: null,
      reps: 2,
      scheduleEdits: [{ at: 3_000, kind: 'reset' }],
    });
  });

  it('keeps a manual due date and replays later reviews on top of it', () => {
    const first = review({ eventId: 'e1', timestamp: 1_000, grade: 3 });
    const later = review({ eventId: 'e2', timestamp: 5_000_000, grade: 3 });
    const edit = { at: 2_000, kind: 'due' as const, due: 4_000_000 };
    const a = backup({
      courses: [course('course-1')],
      cards: [card('c1', { updatedAt: 2_000, scheduleEdits: [edit] })],
      reviewHistory: [historyEntry('c1', first)],
    });
    const b = backup({
      courses: [course('course-1')],
      cards: [card('c1', { updatedAt: 5_000_000 })],
      reviewHistory: [historyEntry('c1', first), historyEntry('c1', later)],
    });

    const engine = makeEngine(PARAMS);
    let expected = card('c1');
    expected = { ...expected, ...applyReview(engine, expected, 3, 1_000).memory, due: edit.due };
    expected = { ...expected, ...applyReview(engine, expected, 3, 5_000_000).memory };

    const merged = expectPeerProperties(a, b);
    expect(merged.cards[0].due).toBe(expected.due);
    expect(merged.cards[0].stability).toBe(expected.stability);
    expect(merged.cards[0].scheduleEdits).toEqual([edit]);

    const editOnly = expectPeerProperties(
      a,
      backup({ ...b, reviewHistory: [historyEntry('c1', first)] }),
    );
    expect(editOnly.cards[0].due).toBe(edit.due);
  });

  it('drops reviews that belong to a tombstoned card', () => {
    const log = review({ eventId: 'gone', timestamp: 10, grade: 3 });
    const a = backup({
      tombstones: [tombstone('cards', 'c1', 50)],
    });
    const b = backup({
      cards: [card('c1', { updatedAt: 10, history: [log] })],
      reviewHistory: [historyEntry('c1', log)],
      sessionHistory: [sample('gone', 10)],
    });
    const merged = expectPeerProperties(a, b);
    expect(merged.cards).toEqual([]);
    expect(merged.reviewHistory).toEqual([]);
    expect(merged.sessionHistory).toEqual([]);
  });

  it('synthesises legacy review ids instead of dropping them', () => {
    const legacyA = review({ timestamp: 10, grade: 3 });
    const legacyB = review({ timestamp: 20, grade: 4 });
    const a = backup({
      cards: [card('c1', { history: [legacyA], updatedAt: 10 })],
    });
    const b = backup({
      cards: [card('c1', { history: [legacyB], updatedAt: 20 })],
    });
    const merged = expectPeerProperties(a, b);
    expect(merged.reviewHistory).toHaveLength(2);
    expect(merged.reviewHistory.every((entry) => entry.id.startsWith('review:legacy:'))).toBe(true);
    expect(merged.reviewHistory.map((entry) => entry.grade).sort()).toEqual([3, 4]);
  });

  it('deduplicates identical legacy rows via the existing helper', () => {
    const legacy = review({ timestamp: 10, grade: 3 });
    const a = backup({ cards: [card('c1', { history: [legacy], updatedAt: 10 })] });
    const b = backup({ cards: [card('c1', { history: [legacy], updatedAt: 10 })] });
    const merged = expectPeerProperties(a, b);
    expect(merged.reviewHistory).toHaveLength(1);
    expect(merged.reviewHistory[0].id).toBe(reviewHistoryEntryId('c1', legacy));
    expect(reviewHistoryEntriesForCard(merged.cards[0])).toHaveLength(0);
  });

  it('does not re-apply leech policy onto newest-wins content flags', () => {
    const a = backup({
      cards: [card('c1', { suspended: true, updatedAt: 10, lapses: 12 })],
    });
    const b = backup({
      cards: [card('c1', { suspended: false, flagged: true, updatedAt: 20 })],
    });
    const merged = expectPeerProperties(a, b);
    expect(merged.cards[0].suspended).toBe(false);
    expect(merged.cards[0].flagged).toBe(true);
  });
});
