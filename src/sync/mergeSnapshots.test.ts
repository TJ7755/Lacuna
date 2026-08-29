import { describe, expect, it } from 'vitest';
import type {
  BackupAsset,
  BackupFile,
  Card,
  CourseRecord,
  Lesson,
  ReviewLog,
  SessionHistoryEntry,
  Tombstone,
  AgentMemory,
} from '../db/types';
import {
  reviewHistoryEntriesForCard,
  reviewHistoryEntryId,
  type ReviewHistoryEntry,
} from '../db/reviewHistory';
import { applyReview, makeEngine } from '../fsrs/fsrs';
import { defaultFsrsParameters } from '../fsrs/params';
import { mergeSnapshots, type MergedBackupFile } from './mergeSnapshots';

const PARAMS = defaultFsrsParameters();

function backup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'lacuna',
    version: 10,
    exportedAt: 1,
    cards: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    ...overrides,
  };
}

function course(id: string, overrides: Partial<CourseRecord> = {}): CourseRecord {
  return {
    id,
    name: id,
    description: '',
    createdAt: 1,
    updatedAt: 1,
    fsrsVersion: 6,
    fsrsParameters: PARAMS,
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 14,
    practiceMaxGap: 2,
    ...overrides,
  };
}

function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    conceptId: `concept-${id}`,
    type: 'front_back',
    front: 'Q',
    back: 'A',
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    schedulingUnitId: 'course-1',
    courseId: 'course-1',
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    history: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function memory(id: string, overrides: Partial<AgentMemory> = {}): AgentMemory {
  return {
    id,
    courseId: null,
    tags: ['preference'],
    status: 'active',
    content: id,
    references: [],
    basis: 'learner-stated',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewLog> & Pick<ReviewLog, 'timestamp' | 'grade'>): ReviewLog {
  return {
    sessionId: 'session-1',
    responseTimeSec: 4,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 1,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
    ...overrides,
  };
}

function historyEntry(cardId: string, log: ReviewLog): ReviewHistoryEntry {
  return {
    ...log,
    id: log.eventId
      ? `review:event:${encodeURIComponent(log.eventId)}`
      : reviewHistoryEntryId(cardId, log),
    cardId,
    courseId: 'course-1',
    schedulingUnitId: 'course-1',
  };
}

function tombstone(table: string, recordId: string, deletedAt: number): Tombstone {
  return { table, recordId, deletedAt };
}

function asset(hash: string, data = 'Zg=='): BackupAsset {
  return { hash, data, mimeType: 'image/png', createdAt: 1 };
}

function sample(eventId: string, timestamp: number): SessionHistoryEntry {
  return {
    eventId,
    timestamp,
    deckId: 'course-1',
    courseId: 'course-1',
    averagePredictedRetrievability: 0.9,
  };
}

function expectPeerProperties(a: BackupFile, b: BackupFile): MergedBackupFile {
  const ab = mergeSnapshots(a, b);
  const ba = mergeSnapshots(b, a);
  expect(ab).toEqual(ba);
  expect(mergeSnapshots(a, ab)).toEqual(ab);
  expect(mergeSnapshots(b, ab)).toEqual(ab);
  return ab;
}

describe('mergeSnapshots', () => {
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
    expect(merged.version).toBe(11);
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

  it('unions reviews from both devices and replays FSRS with fuzz off', () => {
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
    const engine = makeEngine({ ...PARAMS, enable_fuzz: false });
    expected = { ...expected, ...applyReview(engine, expected, 3, 1_000).memory };
    expected = { ...expected, ...applyReview(engine, expected, 4, 2_000).memory };

    const merged = expectPeerProperties(a, b);
    expect(merged.reviewHistory.map((entry) => entry.eventId).sort()).toEqual(['e1', 'e2']);
    expect(merged.cards[0].stability).toBe(expected.stability);
    expect(merged.cards[0].difficulty).toBe(expected.difficulty);
    expect(merged.cards[0].due).toBe(expected.due);
    expect(merged.cards[0].state).toBe(expected.state);
    expect(merged.cards[0].lastReviewed).toBe(expected.lastReviewed);
    expect(merged.cards[0].history.map((entry) => entry.eventId)).toEqual(['e1', 'e2']);
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
    expect(reviewHistoryEntriesForCard(merged.cards[0])).toHaveLength(1);
  });

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
