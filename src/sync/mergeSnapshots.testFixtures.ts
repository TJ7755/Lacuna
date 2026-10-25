import { expect } from 'vitest';
import type {
  BackupAsset,
  BackupFile,
  Card,
  CourseRecord,
  ReviewLog,
  SessionHistoryEntry,
  Tombstone,
  AgentMemory,
} from '../db/types';
import { reviewHistoryEntryId, type ReviewHistoryEntry } from '../db/reviewHistory';
import { defaultFsrsParameters } from '../fsrs/params';
import { mergeSnapshots, type MergedBackupFile } from './mergeSnapshots';

export const PARAMS = defaultFsrsParameters();

export function backup(overrides: Partial<BackupFile> = {}): BackupFile {
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

export function course(id: string, overrides: Partial<CourseRecord> = {}): CourseRecord {
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

export function card(id: string, overrides: Partial<Card> = {}): Card {
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

export function memory(id: string, overrides: Partial<AgentMemory> = {}): AgentMemory {
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

export function review(
  overrides: Partial<ReviewLog> & Pick<ReviewLog, 'timestamp' | 'grade'>,
): ReviewLog {
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

export function historyEntry(cardId: string, log: ReviewLog): ReviewHistoryEntry {
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

export function tombstone(table: string, recordId: string, deletedAt: number): Tombstone {
  return { table, recordId, deletedAt };
}

export function asset(hash: string, data = 'Zg=='): BackupAsset {
  return { hash, data, mimeType: 'image/png', createdAt: 1 };
}

export function sample(eventId: string, timestamp: number): SessionHistoryEntry {
  return {
    eventId,
    timestamp,
    deckId: 'course-1',
    courseId: 'course-1',
    averagePredictedRetrievability: 0.9,
  };
}

export function expectPeerProperties(a: BackupFile, b: BackupFile): MergedBackupFile {
  const ab = mergeSnapshots(a, b);
  const ba = mergeSnapshots(b, a);
  expect(ab).toEqual(ba);
  expect(mergeSnapshots(a, ab)).toEqual(ab);
  expect(mergeSnapshots(b, ab)).toEqual(ab);
  return ab;
}
