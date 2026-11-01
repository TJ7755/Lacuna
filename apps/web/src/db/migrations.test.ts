import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { FSRS_VERSION, defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import {
  buildLessonCardExposureBackfill,
  migrateCardRecord,
  migrateDeckRecord,
} from './migrations';
import type { ReviewLog } from '@lacuna/core/db/types';

describe('migrateDeckRecord', () => {
  it('re-tags an old deck to fsrs_version 6 and reseeds default FSRS-6 parameters', () => {
    // A deck as stored under the old 17-parameter schema: no FSRS-6 fields at all.
    const legacy = {
      id: 'd1',
      name: 'Old deck',
      examDate: 1000,
      createdAt: 0,
    };
    const migrated = migrateDeckRecord(legacy);
    expect(migrated.fsrsVersion).toBe(6);
    expect(migrated.fsrsParameters).toEqual(defaultFsrsParameters());
    expect(migrated.fsrsParameters.w).toHaveLength(21);
    expect(migrated.examObjective).toBe('expectedMarks');
    // Existing data is preserved.
    expect(migrated.name).toBe('Old deck');
    expect(migrated.examDate).toBe(1000);
  });

  it('does not overwrite an already-current deck’s parameters', () => {
    const tuned = defaultFsrsParameters();
    tuned.w[20] = 0.25;
    const migrated = migrateDeckRecord({
      id: 'd2',
      name: 'Current',
      examDate: 1,
      createdAt: 0,
      fsrsVersion: FSRS_VERSION,
      fsrsParameters: tuned,
      examObjective: 'securedTopics',
    });
    expect(migrated.fsrsParameters.w[20]).toBe(0.25);
    expect(migrated.examObjective).toBe('securedTopics');
  });
});

describe('migrateCardRecord', () => {
  it('derives reps/lapses/state from history and adds new fields', () => {
    const history: ReviewLog[] = [
      {
        timestamp: 1,
        grade: 1,
        responseTimeSec: 4,
        distracted: false,
        stabilityBefore: null,
        stabilityAfter: 0.4,
        difficultyBefore: null,
        difficultyAfter: 6,
        retrievabilityAtReview: null,
      },
      {
        timestamp: 2,
        grade: 3,
        responseTimeSec: 2,
        distracted: false,
        stabilityBefore: 0.4,
        stabilityAfter: 3,
        difficultyBefore: 6,
        difficultyAfter: 5.5,
        retrievabilityAtReview: 0.7,
      },
    ];
    const migrated = migrateCardRecord({
      id: 'c1',
      deckId: 'd1',
      schedulingUnitId: 'd1',
      type: 'front_back',
      front: 'q',
      back: 'a',
      stability: 3,
      difficulty: 5.5,
      lastReviewed: 2,
      history,
      createdAt: 0,
    });
    expect(migrated.reps).toBe(2);
    expect(migrated.lapses).toBe(1);
    expect(migrated.state).toBe(2); // reviewed => Review
    expect(migrated.scheduledDays).toBe(0);
    expect(migrated.learningSteps).toBe(0);
    expect(migrated.stability).toBe(3); // preserved
  });

  it('treats a never-reviewed card as State.New', () => {
    const migrated = migrateCardRecord({
      id: 'c2',
      deckId: 'd1',
      schedulingUnitId: 'd1',
      type: 'cloze',
      front: '{{c1::x}}',
      back: '',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      history: [],
      createdAt: 0,
    });
    expect(migrated.state).toBe(0);
    expect(migrated.reps).toBe(0);
    expect(migrated.lapses).toBe(0);
    expect(migrated.due).toBe(null);
  });

  it('folds a legacy typing card into front_back', () => {
    const migrated = migrateCardRecord({
      id: 'c3',
      deckId: 'd1',
      schedulingUnitId: 'd1',
      type: 'typing',
      front: 'Capital of Japan?',
      back: 'Tokyo',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      history: [],
      createdAt: 0,
    });
    expect(migrated.type).toBe('front_back');
    expect(migrated.front).toBe('Capital of Japan?');
    expect(migrated.back).toBe('Tokyo');
  });

  it('leaves non-typing types untouched', () => {
    const migrated = migrateCardRecord({
      id: 'c4',
      deckId: 'd1',
      schedulingUnitId: 'd1',
      type: 'basic_reversed',
      front: 'q',
      back: 'a',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      history: [],
      createdAt: 0,
    });
    expect(migrated.type).toBe('basic_reversed');
  });
});

describe('buildLessonCardExposureBackfill', () => {
  it('backfills reviewed cards for their primary lesson only', () => {
    const rows = buildLessonCardExposureBackfill([
      {
        id: 'reviewed',
        primaryLessonId: 'primary',
        state: 2,
        lastReviewed: 200,
        createdAt: 100,
      },
      {
        id: 'new',
        primaryLessonId: 'primary',
        state: 0,
        lastReviewed: null,
        createdAt: 100,
      },
      {
        id: 'unassigned',
        primaryLessonId: null,
        state: 2,
        lastReviewed: 300,
        createdAt: 100,
      },
    ]);

    expect(rows).toEqual([
      { lessonId: 'primary', cardId: 'reviewed', taughtAt: 200, updatedAt: 200 },
    ]);
  });
});
