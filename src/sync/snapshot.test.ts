import { describe, expect, it } from 'vitest';
import type {
  AgentMemory,
  BackupFile,
  Card,
  CourseRecord,
  Lesson,
  Note,
  Occlusion,
  SchedulingUnitRecord,
  SessionHistoryEntry,
} from '../db/types';
import type { ReviewHistoryEntry } from '../db/reviewHistory';
import { PRE_V22_BACKUP_MESSAGE } from '../db/portability';
import {
  assertSnapshotSize,
  decodeSnapshot,
  encodeSnapshot,
  snapshotsEquivalent,
  SyncPayloadError,
  SyncSnapshotTooLargeError,
} from './snapshot';

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

describe('snapshot wire helpers', () => {
  it('round-trips a valid backup through UTF-8 JSON', () => {
    const value = backup({ exportedAt: 42 });

    expect(decodeSnapshot(encodeSnapshot(value))).toEqual(value);
  });

  it('rejects malformed, undecodable, and non-Lacuna payloads', () => {
    expect(() => decodeSnapshot(new TextEncoder().encode('{'))).toThrow(SyncPayloadError);
    expect(() => decodeSnapshot(new Uint8Array([0xff]))).toThrow(SyncPayloadError);
    expect(() =>
      decodeSnapshot(new TextEncoder().encode(JSON.stringify({ app: 'other' }))),
    ).toThrow(SyncPayloadError);
  });

  it('rejects pre-v22 backups with the compatibility message', () => {
    const preV22 = backup({
      version: 21,
      decks: [{ id: 'deck-1', name: 'Legacy deck' }],
    } as unknown as Partial<BackupFile>);

    expect(() => decodeSnapshot(encodeSnapshot(preV22))).toThrow(PRE_V22_BACKUP_MESSAGE);
  });

  it('treats export time, object order, array order, and absent optional tables as non-state', () => {
    const left = backup({
      exportedAt: 1,
      assets: [
        { hash: 'b'.repeat(64), data: 'b', mimeType: 'image/png', createdAt: 1 },
        { hash: 'a'.repeat(64), data: 'a', mimeType: 'image/png', createdAt: 1 },
      ],
      courses: [{ id: 'course-1', name: 'Chemistry' } as unknown as CourseRecord],
    });
    const right = {
      ...backup({
        exportedAt: 99,
        assets: [
          { hash: 'a'.repeat(64), data: 'a', mimeType: 'image/png', createdAt: 1 },
          { hash: 'b'.repeat(64), data: 'b', mimeType: 'image/png', createdAt: 1 },
        ],
      }),
      courses: [{ name: 'Chemistry', id: 'course-1' } as unknown as CourseRecord],
    };

    expect(snapshotsEquivalent(left, right)).toBe(true);
  });

  it('names the course contributing to an oversized transport body', () => {
    const snapshot = backup({
      courses: [
        {
          id: 'course-1',
          name: 'Organic Chemistry',
          description: 'large course',
        } as unknown as CourseRecord,
      ],
    });

    try {
      assertSnapshotSize(snapshot, 101, 50, 100);
      throw new Error('expected the size check to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncSnapshotTooLargeError);
      expect(error).toMatchObject({
        report: expect.objectContaining({
          plaintextBytes: 50,
          transportBytes: 101,
          limitBytes: 100,
          courseNames: ['Organic Chemistry'],
        }),
        message:
          'This sync snapshot is 0.00 MB, above the 0.00 MB limit. Reduce content in: Organic Chemistry.',
      });
    }
  });

  it('attributes cards, reviews and sessions to a course through their scheduling unit', () => {
    const snapshot = backup({
      courses: [
        { id: 'alpha', name: 'Alpha' } as CourseRecord,
        { id: 'beta', name: 'Beta', description: 'b'.repeat(2_000) } as unknown as CourseRecord,
      ],
      schedulingUnits: [{ id: 'unit-a', courseId: 'alpha' } as unknown as SchedulingUnitRecord],
      cards: [
        { id: 'card-a', schedulingUnitId: 'unit-a', front: 'q', back: 'a'.repeat(3_000) },
      ] as unknown as Card[],
      reviewHistory: [{ cardId: 'card-a', grade: 3 }] as unknown as ReviewHistoryEntry[],
      sessionHistory: [
        // A course id that is not in the snapshot falls back to the scheduling unit.
        { timestamp: 1, deckId: 'old', courseId: 'gone', schedulingUnitId: 'unit-a' },
        { timestamp: 2, deckId: 'unit-a' },
      ] as SessionHistoryEntry[],
    });

    // Nothing is left over as "other local data", so every row found its course.
    expect(assertSnapshotSize(snapshot, 1, 1, 10).courseNames).toEqual(['Alpha', 'Beta']);
  });

  it('charges assets to the courses that reference them and the rest to other data', () => {
    const hash = (char: string) => char.repeat(64);
    const asset = (char: string, size: number) => ({
      hash: hash(char),
      data: 'x'.repeat(size),
      mimeType: 'image/png',
      createdAt: 1,
    });
    const snapshot = backup({
      courses: [
        { id: 'alpha', name: 'Alpha' } as CourseRecord,
        { id: 'beta', name: 'Beta', description: 'b'.repeat(2_000) } as unknown as CourseRecord,
      ],
      lessons: [{ id: 'lesson-a', courseId: 'alpha' } as Lesson],
      // Note references are matched case-insensitively.
      notes: [
        { id: 'note', lessonId: 'lesson-a', content: `![](lacuna-asset://${hash('A')})` },
      ] as Note[],
      occlusions: [{ id: 'occ', courseId: 'beta', assetHash: hash('c') }] as Occlusion[],
      assets: [asset('a', 5_000), asset('c', 10)],
    });

    expect(assertSnapshotSize(snapshot, 1, 1, 10).courseNames).toEqual(['Alpha', 'Beta']);
    snapshot.assets.push(asset('d', 10));
    expect(assertSnapshotSize(snapshot, 1, 1, 10).courseNames).toEqual([
      'Alpha',
      'Beta',
      'other local data',
    ]);
  });

  it('treats absent memory tables as empty and attributes scoped and global memory bytes', () => {
    const scoped: AgentMemory = {
      id: 'scoped',
      courseId: 'course-1',
      tags: ['context'],
      status: 'active',
      content: 'Course context',
      references: [],
      basis: 'learner-stated',
      createdAt: 1,
      updatedAt: 1,
    };
    expect(snapshotsEquivalent(backup(), backup({ agentMemories: [] }))).toBe(true);
    try {
      assertSnapshotSize(
        backup({
          courses: [{ id: 'course-1', name: 'Maths' } as CourseRecord],
          agentMemories: [scoped, { ...scoped, id: 'global', courseId: null }],
        }),
        2,
        1,
        1,
      );
      throw new Error('expected the size check to fail');
    } catch (error) {
      expect(error).toMatchObject({
        report: expect.objectContaining({ courseNames: ['Maths', 'other local data'] }),
      });
    }
  });
});
