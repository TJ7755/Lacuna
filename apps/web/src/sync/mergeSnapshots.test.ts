import { describe, expect, it } from 'vitest';
import type {
  Lesson,
  LineageIdMapping,
  PendingMergeReview,
  Tombstone,
} from '@lacuna/core/db/types';
import { mergeSnapshots } from './mergeSnapshots';

import {
  backup,
  card,
  memory,
  tombstone,
  expectPeerProperties,
} from './mergeSnapshots.testFixtures';

describe('peer record and deletion reconciliation', () => {
  it('converges memory updates, deletions and deliberate resurrection', () => {
    const old = memory('memory-1', { content: 'old', updatedAt: 2 });
    const updated = memory('memory-1', { content: 'new', updatedAt: 4 });
    const deletion: Tombstone = { table: 'agentMemories', recordId: old.id, deletedAt: 3 };
    expect(
      mergeSnapshots(
        backup({ agentMemories: [old], tombstones: [deletion] }),
        backup({ agentMemories: [updated] }),
      ).agentMemories,
    ).toEqual([updated]);

    const deleted = mergeSnapshots(
      backup({ agentMemories: [old] }),
      backup({ tombstones: [{ ...deletion, deletedAt: 5 }] }),
    );
    expect(deleted.agentMemories).toEqual([]);
    expect(deleted.tombstones).toContainEqual({ ...deletion, deletedAt: 5 });
  });

  it('uses canonical JSON to converge equal-time memory conflicts', () => {
    const left = backup({ agentMemories: [memory('memory-1', { content: 'alpha' })] });
    const right = backup({ agentMemories: [memory('memory-1', { content: 'omega' })] });
    expect(mergeSnapshots(left, right)).toEqual(mergeSnapshots(right, left));
    expect(mergeSnapshots(left, right).agentMemories[0].content).toBe('omega');
  });

  it('rejects peer memory conflicts that change immutable scope', () => {
    const global = memory('memory-1', { courseId: null });
    const scoped = memory('memory-1', { courseId: 'course-1', updatedAt: 2 });
    expect(() =>
      mergeSnapshots(backup({ agentMemories: [global] }), backup({ agentMemories: [scoped] })),
    ).toThrow('cannot move between global and Course scope');
  });

  it('is commutative and idempotent on empty snapshots', () => {
    const a = backup({ exportedAt: 10 });
    const b = backup({ exportedAt: 20 });
    const merged = expectPeerProperties(a, b);
    expect(merged.exportedAt).toBe(20);
    expect(merged.version).toBe(15);
    expect(merged.userPerformance).toEqual([]);
  });

  it('takes newest-wins content and ignores the newer card scheduler fields', () => {
    const a = backup({
      cards: [
        card('c1', {
          front: 'old',
          updatedAt: 10,
          stability: 99,
          difficulty: 9,
          state: 2,
          due: 500,
          lastReviewed: 10,
          reps: 8,
        }),
      ],
    });
    const b = backup({
      cards: [
        card('c1', {
          front: 'new',
          updatedAt: 20,
          stability: 12,
          difficulty: 3,
          state: 2,
          due: 800,
          lastReviewed: 20,
          reps: 3,
        }),
      ],
    });
    const merged = expectPeerProperties(a, b);
    expect(merged.cards).toHaveLength(1);
    expect(merged.cards[0].front).toBe('new');
    expect(merged.cards[0].updatedAt).toBe(20);
    expect(merged.cards[0].stability).toBeNull();
    expect(merged.cards[0].due).toBeNull();
    expect(merged.cards[0].reps).toBe(0);
    expect(merged.cards[0].history).toEqual([]);
  });

  it('breaks an equal-updatedAt content tie with canonical JSON', () => {
    const a = backup({ cards: [card('c1', { front: 'alpha', updatedAt: 10 })] });
    const b = backup({ cards: [card('c1', { front: 'zeta', updatedAt: 10 })] });
    const merged = expectPeerProperties(a, b);
    expect(merged.cards[0].front).toBe('zeta');
  });

  it('honours a delete when the other device has not touched the row', () => {
    const a = backup({
      tombstones: [tombstone('cards', 'c1', 50)],
    });
    const b = backup({
      cards: [card('c1', { updatedAt: 10 })],
    });
    const merged = expectPeerProperties(a, b);
    expect(merged.cards).toEqual([]);
    expect(merged.tombstones).toEqual([tombstone('cards', 'c1', 50)]);
  });

  it('resurrects when the surviving edit is strictly newer than the tombstone', () => {
    const a = backup({
      tombstones: [tombstone('cards', 'c1', 50)],
    });
    const b = backup({
      cards: [card('c1', { front: 'edited later', updatedAt: 80 })],
    });
    const merged = expectPeerProperties(a, b);
    expect(merged.cards).toHaveLength(1);
    expect(merged.cards[0].front).toBe('edited later');
    expect(merged.tombstones).toEqual([]);
  });

  it('keeps the tombstone when updatedAt equals deletedAt', () => {
    const a = backup({ tombstones: [tombstone('cards', 'c1', 50)] });
    const b = backup({ cards: [card('c1', { updatedAt: 50 })] });
    const merged = expectPeerProperties(a, b);
    expect(merged.cards).toEqual([]);
    expect(merged.tombstones).toEqual([tombstone('cards', 'c1', 50)]);
  });

  it('takes the later edit when both sides changed the same record', () => {
    const a = backup({
      notes: [
        {
          id: 'n1',
          lessonId: 'l1',
          name: 'A',
          content: 'one',
          orderIndex: 0,
          createdAt: 1,
          updatedAt: 10,
        },
      ],
    });
    const b = backup({
      notes: [
        {
          id: 'n1',
          lessonId: 'l1',
          name: 'B',
          content: 'two',
          orderIndex: 0,
          createdAt: 1,
          updatedAt: 20,
        },
      ],
    });
    const merged = expectPeerProperties(a, b);
    expect(merged.notes[0]).toMatchObject({ name: 'B', content: 'two', updatedAt: 20 });
  });

  it('resurrects a card whose tombstone was pruned after the 90-day window', () => {
    const a = backup({ cards: [], tombstones: [] });
    const b = backup({ cards: [card('stale', { updatedAt: 1 })] });
    const merged = expectPeerProperties(a, b);
    expect(merged.cards.map((row) => row.id)).toEqual(['stale']);
    expect(merged.tombstones).toEqual([]);
  });

  it('backfills a missing updatedAt from createdAt', () => {
    const stale = {
      id: 'l1',
      courseId: 'course-1',
      name: 'Old',
      orderIndex: 0,
      createdAt: 40,
      isExtension: false,
    };
    const a = backup({
      lessons: [stale as Lesson],
    });
    const b = backup({
      lessons: [
        {
          id: 'l1',
          courseId: 'course-1',
          name: 'New',
          orderIndex: 0,
          createdAt: 10,
          updatedAt: 30,
          isExtension: false,
        },
      ],
    });
    const merged = expectPeerProperties(a, b);
    expect(merged.lessons[0].name).toBe('Old');
    expect(merged.lessons[0].updatedAt).toBe(40);
  });

  it('keeps the later deletedAt when both sides tombstone the same row', () => {
    const a = backup({ tombstones: [tombstone('notes', 'n1', 10)] });
    const b = backup({ tombstones: [tombstone('notes', 'n1', 30)] });
    const merged = expectPeerProperties(a, b);
    expect(merged.tombstones).toEqual([tombstone('notes', 'n1', 30)]);
  });

  it('honours detach tombstones for lineage mappings and pending merge reviews', () => {
    const mapping: LineageIdMapping = {
      id: 'lineage-1',
      courseId: 'course-1',
      lessonIds: [],
      noteIds: [],
      cardIds: [],
      sequenceIds: [],
      lessonSnapshots: {},
      noteSnapshots: {},
      cardSnapshots: {},
    };
    const review: PendingMergeReview = {
      id: 'review-1',
      courseId: 'course-1',
      lineageId: 'lineage-1',
      revision: 2,
      diff: {
        creates: { lessons: [], notes: [], cards: [] },
        updates: { lessons: [], notes: [], cards: [] },
        removals: { lessonIds: [], noteIds: [], cardIds: [] },
        conflicts: [],
      },
      createdAt: 10,
    };
    const detached = backup({
      tombstones: [
        tombstone('lineageIdMappings', 'lineage-1', 20),
        tombstone('pendingMergeReviews', 'review-1', 20),
      ],
    });
    const peer = backup({ lineageIdMappings: [mapping], pendingMergeReviews: [review] });
    const merged = expectPeerProperties(detached, peer);
    expect(merged.lineageIdMappings).toEqual([]);
    expect(merged.pendingMergeReviews).toEqual([]);
  });
});
