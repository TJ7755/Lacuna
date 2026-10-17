import { describe, expect, it } from 'vitest';
import type { BackupFile, CourseRecord } from '../db/types';
import { defaultFsrsParameters } from '../fsrs/params';
import type { Concept } from '../questions/types';
import { mergeSnapshots } from './mergeSnapshots';
import { decodeSnapshot, encodeSnapshot, snapshotsEquivalent, SyncPayloadError } from './snapshot';

const specificationRef = {
  specificationId: 'future-science-2099',
  tier: 'higher',
  routeIds: ['paper-5'],
  futureOptionalMetadata: { sourceIssue: 'Retain this additive metadata' },
};

function course(): CourseRecord {
  return {
    id: 'science',
    name: 'Science',
    description: '',
    createdAt: 1,
    updatedAt: 1,
    fsrsVersion: 6,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: 'expectedMarks',
    unlockMode: 'open',
    autoPractice: false,
    practiceThresholdMinutesFar: 8,
    practiceThresholdMinutesNear: 4,
    practiceUrgentWindowDays: 14,
    practiceMaxGap: 2,
  };
}

function concept(specificationPointIds: string[], updatedAt: number): Concept {
  return {
    id: 'enzyme-activity',
    name: 'Enzyme activity',
    scope: 'course',
    scopeKey: 'course:science',
    courseId: 'science',
    provisional: false,
    createdAt: 1,
    updatedAt,
    specificationPointIds,
  };
}

function snapshot(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'lacuna-v14',
    version: 14,
    exportedAt: 1,
    cards: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    courses: [{ ...course(), specificationRef }],
    concepts: [concept(['future-science-2099:enzymes.1', 'previous-science:density'], 1)],
    questions: [],
    questionConcepts: [],
    questionAttempts: [],
    questionSets: [],
    questionSetAttempts: [],
    practiceNodes: [],
    ...overrides,
  };
}

describe('specification sync snapshots', () => {
  it('round-trips references and links without requiring catalogue entries or matching selections', async () => {
    const value = snapshot();

    expect(await decodeSnapshot((await encodeSnapshot(value)).payload)).toEqual(value);
  });

  it('rejects malformed links after decoding an encoded snapshot', async () => {
    const malformed = snapshot({ concepts: [concept(['unqualified'], 1)] });

    await expect(decodeSnapshot((await encodeSnapshot(malformed)).payload)).rejects.toThrow(
      SyncPayloadError,
    );
  });

  it('uses whole-record last-writer-wins for concurrent link edits, including link removal', () => {
    const older = snapshot({ concepts: [concept(['science:enzymes'], 10)] });
    const newer = snapshot({
      courses: [
        { ...course(), updatedAt: 20, specificationRef: { specificationId: 'new-science' } },
      ],
      concepts: [{ ...concept([], 20), name: 'Renamed Concept' }],
    });

    const merged = mergeSnapshots(older, newer);
    expect(merged.concepts).toEqual(newer.concepts);
    expect(merged.courses).toEqual(newer.courses);
    expect(mergeSnapshots(newer, older)).toEqual(merged);
    expect(mergeSnapshots(merged, older)).toEqual(merged);
  });

  it('breaks equal-timestamp link conflicts with the existing canonical JSON record order', () => {
    const left = snapshot({ concepts: [concept(['science:alpha'], 10)] });
    const right = snapshot({ concepts: [concept(['science:zeta'], 10)] });

    const merged = mergeSnapshots(left, right);
    expect(merged.concepts).toEqual(right.concepts);
    expect(mergeSnapshots(right, left)).toEqual(merged);
    expect(mergeSnapshots(merged, left)).toEqual(merged);
  });

  it('includes specification changes when comparing snapshot state', () => {
    const original = snapshot();
    const changedReference = snapshot({
      courses: [{ ...course(), specificationRef: { ...specificationRef, tier: 'foundation' } }],
    });
    const changedLinks = snapshot({ concepts: [concept([], 1)] });

    expect(snapshotsEquivalent(original, changedReference)).toBe(false);
    expect(snapshotsEquivalent(original, changedLinks)).toBe(false);
  });
});
