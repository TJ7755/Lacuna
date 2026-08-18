import { describe, expect, it } from 'vitest';
import type { BackupFile, CourseRecord } from '../db/types';
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
});
