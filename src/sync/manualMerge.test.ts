import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile, Card, CourseRecord, Lesson } from '../db/types';
import { reviewHistoryEntryId, type ReviewHistoryEntry } from '../db/reviewHistory';
import { defaultFsrsParameters } from '../fsrs/params';
import { ManualMergeError, manualMerge, summariseMerge } from './manualMerge';

const { takeAutoBackup, importBackup } = vi.hoisted(() => ({
  takeAutoBackup: vi.fn(),
  importBackup: vi.fn(),
}));

vi.mock('../db/backups', () => ({
  takeAutoBackup,
}));

vi.mock('../db/portability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/portability')>();
  return {
    ...actual,
    importBackup,
  };
});

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

function lesson(id: string, overrides: Partial<Lesson> = {}): Lesson {
  return {
    id,
    courseId: 'course-1',
    name: id,
    orderIndex: 0,
    createdAt: 1,
    updatedAt: 1,
    isExtension: false,
    ...overrides,
  };
}

function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
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

function reviewEvent(cardId: string, eventId: string, timestamp: number): ReviewHistoryEntry {
  const log = {
    timestamp,
    grade: 3 as const,
    eventId,
    sessionId: 'session-1',
    responseTimeSec: 4,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 1,
    difficultyBefore: null,
    difficultyAfter: 5,
    retrievabilityAtReview: null,
  };
  return {
    ...log,
    id: reviewHistoryEntryId(cardId, log),
    cardId,
    courseId: 'course-1',
    schedulingUnitId: 'course-1',
  };
}

describe('manualMerge', () => {
  beforeEach(() => {
    takeAutoBackup.mockReset();
    importBackup.mockReset();
    takeAutoBackup.mockResolvedValue(backup());
    importBackup.mockResolvedValue({});
  });

  it('takes a forced restore point and applies that same snapshot', async () => {
    const local = backup({ exportedAt: 10, cards: [card('c1')] });
    const order: string[] = [];
    takeAutoBackup.mockImplementation(async () => {
      order.push('backup');
      return local;
    });
    importBackup.mockImplementation(async () => {
      order.push('import');
      return {};
    });

    await manualMerge(backup());

    expect(takeAutoBackup).toHaveBeenCalledWith(true);
    expect(order).toEqual(['backup', 'import']);
    expect(importBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: [expect.objectContaining({ id: 'c1' })],
      }),
      'replace',
    );
  });

  it('aborts without writing if the safety backup fails', async () => {
    takeAutoBackup.mockRejectedValue(new Error('IndexedDB unavailable'));

    const result = manualMerge(backup());
    await expect(result).rejects.toBeInstanceOf(ManualMergeError);
    await expect(result).rejects.toMatchObject({
      databaseModified: false,
      message: expect.stringContaining('IndexedDB unavailable'),
    });
    expect(importBackup).not.toHaveBeenCalled();
  });

  it('aborts without writing if the forced restore point is skipped', async () => {
    takeAutoBackup.mockResolvedValue(undefined);

    await expect(manualMerge(backup())).rejects.toMatchObject({
      name: 'ManualMergeError',
      databaseModified: false,
      message: 'A safety backup could not be taken, so the database was not modified.',
    });
    expect(importBackup).not.toHaveBeenCalled();
  });

  it('rejects an invalid file before any write', async () => {
    await expect(manualMerge({ app: 'not-lacuna' } as unknown as BackupFile)).rejects.toMatchObject(
      {
        name: 'ManualMergeError',
        databaseModified: false,
        message: 'This file is not a valid Lacuna backup.',
      },
    );
    expect(takeAutoBackup).not.toHaveBeenCalled();
    expect(importBackup).not.toHaveBeenCalled();
  });

  it('applies the merged snapshot and returns before/after counts', async () => {
    const local = backup({
      exportedAt: 10,
      cards: [card('c1')],
      courses: [course('course-1')],
      lessons: [lesson('l1')],
      reviewHistory: [reviewEvent('c1', 'event-1', 100)],
    });
    const remote = backup({
      exportedAt: 20,
      cards: [card('c2', { courseId: 'course-2', schedulingUnitId: 'course-2' })],
      courses: [course('course-2')],
      lessons: [lesson('l2', { courseId: 'course-2' })],
      reviewHistory: [reviewEvent('c2', 'event-2', 200)],
    });
    takeAutoBackup.mockResolvedValue(local);

    const summary = await manualMerge(remote);

    expect(importBackup).toHaveBeenCalledTimes(1);
    expect(importBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.arrayContaining([
          expect.objectContaining({ id: 'c1' }),
          expect.objectContaining({ id: 'c2' }),
        ]),
      }),
      'replace',
    );
    expect(summary).toEqual({
      cards: { kept: 1, added: 1, removed: 0 },
      courses: { kept: 1, added: 1, removed: 0 },
      lessons: { kept: 1, added: 1, removed: 0 },
      reviewEvents: { kept: 1, added: 1, removed: 0 },
    });
  });

  it('runs the pre-apply hook before replacing the database', async () => {
    const order: string[] = [];
    const beforeApply = vi.fn(async () => {
      order.push('before-apply');
    });
    importBackup.mockImplementation(async () => {
      order.push('import');
    });

    await manualMerge(backup(), { beforeApply });

    expect(beforeApply).toHaveBeenCalledWith(
      expect.objectContaining({ app: 'lacuna', version: 10 }),
    );
    expect(order).toEqual(['before-apply', 'import']);
  });

  it('does not import when the pre-apply hook rejects', async () => {
    const failure = new Error('snapshot rejected');

    await expect(
      manualMerge(backup(), {
        beforeApply: () => {
          throw failure;
        },
      }),
    ).rejects.toMatchObject({
      name: 'ManualMergeError',
      databaseModified: false,
      causeError: failure,
    });
    expect(importBackup).not.toHaveBeenCalled();
  });

  it('preserves the cause and reports the database modified when the import fails', async () => {
    const failure = new Error('IndexedDB write failed');
    importBackup.mockRejectedValue(failure);

    await expect(manualMerge(backup())).rejects.toMatchObject({
      name: 'ManualMergeError',
      databaseModified: true,
      causeError: failure,
    });
  });

  it('reports cards removed when the other snapshot carries a later tombstone', async () => {
    const local = backup({
      exportedAt: 10,
      cards: [card('c1'), card('c2')],
      courses: [course('course-1')],
      lessons: [lesson('l1')],
    });
    const remote = backup({
      exportedAt: 20,
      cards: [card('c1', { updatedAt: 5 })],
      courses: [course('course-1')],
      lessons: [lesson('l1')],
      tombstones: [{ table: 'cards', recordId: 'c2', deletedAt: 50 }],
    });
    takeAutoBackup.mockResolvedValue(local);

    const summary = await manualMerge(remote);

    expect(summary.cards).toEqual({ kept: 1, added: 0, removed: 1 });
  });
});

describe('summariseMerge', () => {
  it('counts kept, added and removed ids', () => {
    const local = backup({
      cards: [card('keep'), card('gone')],
      courses: [course('course-1')],
      lessons: [lesson('l1')],
      reviewHistory: [reviewEvent('keep', 'event-1', 100)],
    });
    const merged = backup({
      cards: [card('keep'), card('new')],
      courses: [course('course-1'), course('course-2')],
      lessons: [lesson('l1')],
      reviewHistory: [reviewEvent('keep', 'event-1', 100), reviewEvent('new', 'event-2', 200)],
    });

    expect(summariseMerge(local, merged)).toEqual({
      cards: { kept: 1, added: 1, removed: 1 },
      courses: { kept: 1, added: 1, removed: 0 },
      lessons: { kept: 1, added: 0, removed: 0 },
      reviewEvents: { kept: 1, added: 1, removed: 0 },
    });
  });
});
