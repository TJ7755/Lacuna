import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile, Card, CourseRecord, Lesson } from '../db/types';
import { reviewHistoryEntryId, type ReviewHistoryEntry } from '../db/reviewHistory';
import { defaultFsrsParameters } from '../fsrs/params';
import { ManualMergeError, manualMerge } from './manualMerge';

const { takeAutoBackup, exportDatabase, importBackup } = vi.hoisted(() => ({
  takeAutoBackup: vi.fn(),
  exportDatabase: vi.fn(),
  importBackup: vi.fn(),
}));

vi.mock('../db/backups', () => ({
  takeAutoBackup,
}));

vi.mock('../db/portability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/portability')>();
  return {
    ...actual,
    exportDatabase,
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
    exportDatabase.mockReset();
    importBackup.mockReset();
    takeAutoBackup.mockResolvedValue(undefined);
    importBackup.mockResolvedValue({});
  });

  it('takes a forced backup before exporting or applying', async () => {
    const order: string[] = [];
    takeAutoBackup.mockImplementation(async () => {
      order.push('backup');
    });
    exportDatabase.mockImplementation(async () => {
      order.push('export');
      return backup();
    });
    importBackup.mockImplementation(async () => {
      order.push('import');
      return {};
    });

    await manualMerge(backup());

    expect(takeAutoBackup).toHaveBeenCalledWith(true);
    expect(order).toEqual(['backup', 'export', 'import']);
  });

  it('aborts without writing if the safety backup fails', async () => {
    takeAutoBackup.mockRejectedValue(new Error('IndexedDB unavailable'));

    const result = manualMerge(backup());
    await expect(result).rejects.toBeInstanceOf(ManualMergeError);
    await expect(result).rejects.toMatchObject({
      databaseModified: false,
      message: expect.stringContaining('IndexedDB unavailable'),
    });
    expect(exportDatabase).not.toHaveBeenCalled();
    expect(importBackup).not.toHaveBeenCalled();
  });

  it('rejects an invalid file before any write', async () => {
    await expect(manualMerge({ app: 'not-lacuna' } as BackupFile)).rejects.toMatchObject({
      name: 'ManualMergeError',
      databaseModified: false,
      message: 'This file is not a valid Lacuna backup.',
    });
    expect(takeAutoBackup).not.toHaveBeenCalled();
    expect(exportDatabase).not.toHaveBeenCalled();
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
    exportDatabase.mockResolvedValue(local);

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
      before: { cards: 1, courses: 1, lessons: 1, reviewEvents: 1 },
      after: { cards: 2, courses: 2, lessons: 2, reviewEvents: 2 },
    });
  });
});
