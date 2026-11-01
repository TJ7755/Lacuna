import { describe, expect, it } from 'vitest';
import type { BackupFile } from '@lacuna/core/db/types';
import { snapshotStateUnchanged } from './mergeSnapshots';

import { backup, card, asset, sample, expectPeerProperties } from './mergeSnapshots.testFixtures';

describe('peer assets, session history and snapshot equality', () => {
  it('unions sessionHistory by eventId and keeps two same-day samples', () => {
    const a = backup({ sessionHistory: [sample('s1', 10), { ...sample('s1', 10), id: 4 }] });
    const b = backup({ sessionHistory: [sample('s2', 10)] });
    const merged = expectPeerProperties(a, b);
    expect(merged.sessionHistory.map((entry) => entry.eventId).sort()).toEqual(['s1', 's2']);
    expect(merged.sessionHistory.every((entry) => entry.id === undefined)).toBe(true);
  });

  it('unions assets by hash and drops those no longer referenced', () => {
    const kept = 'a'.repeat(64);
    const orphan = 'b'.repeat(64);
    const occlusionHash = 'c'.repeat(64);
    const a = backup({
      cards: [card('c1', { front: `![x](lacuna-asset://${kept})` })],
      assets: [asset(kept, 'aaa'), asset(orphan, 'bbb')],
    });
    const b = backup({
      occlusions: [
        {
          id: 'o1',
          courseId: 'course-1',
          primaryLessonId: null,
          name: 'Diagram',
          assetHash: occlusionHash,
          regions: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      assets: [asset(occlusionHash, 'ccc')],
    });
    const merged = expectPeerProperties(a, b);
    expect(merged.assets.map((row) => row.hash).sort()).toEqual([kept, occlusionHash].sort());
  });

  it('discards incoming userPerformance', () => {
    const a = backup({
      userPerformance: [
        {
          deckId: 'course-1',
          runningMeanResponseTime: 4,
          runningStdDevResponseTime: 1,
          m2: 2,
          totalCorrectReviews: 8,
        },
      ],
    });
    const b = backup();
    expect(expectPeerProperties(a, b).userPerformance).toEqual([]);
  });

  it('ignores export time and object-key order', () => {
    const left = backup();
    const right = Object.fromEntries(Object.entries(left).reverse()) as unknown as BackupFile;
    right.exportedAt += 1;

    expect(snapshotStateUnchanged(left, right)).toBe(true);
  });

  it('preserves nested array order', () => {
    const left = { ...backup(), metadata: { steps: ['first', 'second'] } };
    const right = { ...backup(), metadata: { steps: ['second', 'first'] } };

    expect(snapshotStateUnchanged(left, right)).toBe(false);
  });

  it('rejects values that JSON serialisation would silently conflate', () => {
    const nonFinite = { ...backup(), metadata: NaN };
    const nullValue = { ...backup(), metadata: null };
    const date = { ...backup(), metadata: new Date(0) };
    const plainObject = { ...backup(), metadata: {} };
    expect(snapshotStateUnchanged(nonFinite, nullValue)).toBe(false);
    expect(snapshotStateUnchanged(date, plainObject)).toBe(false);
  });

  it('does not normalise missing collections or discard unknown metadata', () => {
    expect(snapshotStateUnchanged(backup(), backup({ notes: [] }))).toBe(false);
    const unknownSchema = { ...backup(), schema: 999 };
    expect(snapshotStateUnchanged(backup(), unknownSchema)).toBe(false);
  });
});
