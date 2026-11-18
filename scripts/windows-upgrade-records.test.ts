import { describe, expect, it } from 'vitest';
import { FSRS6_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-6';
import { FSRS7_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-7';
import { assertUpgradeStudyRecords } from './windows-upgrade-records.mjs';

const course = {
  id: 'course',
  fsrsVersion: 6,
  fsrsParameters: { w: [...FSRS6_DEFAULT_WEIGHTS], requestRetention: 0.9 },
};
const before = {
  courses: [course],
  schedulingUnits: [{ ...course, id: 'unit' }],
  lessons: [{ id: 'lesson', name: 'Retained lesson' }],
  cards: [
    {
      id: 'reviewed',
      front: 'q',
      stability: 8.2956,
      difficulty: 1,
      state: 2,
      reps: 1,
      lapses: 0,
      due: 691201000,
    },
    {
      id: 'new',
      front: 'new',
      stability: null,
      difficulty: null,
      state: 0,
      reps: 0,
      lapses: 0,
      due: null,
    },
  ],
  reviewHistory: [{ cardId: 'reviewed', grade: 4, timestamp: 1000 }],
};
const after = {
  ...before,
  courses: [
    {
      ...course,
      fsrsVersion: 7,
      fsrsParameters: { ...course.fsrsParameters, w: [...FSRS7_DEFAULT_WEIGHTS] },
    },
  ],
  schedulingUnits: [
    {
      ...course,
      id: 'unit',
      fsrsVersion: 7,
      fsrsParameters: { ...course.fsrsParameters, w: [...FSRS7_DEFAULT_WEIGHTS] },
    },
  ],
  cards: [
    { ...before.cards[0], stability: 11.7841, stabilityFast: 9.42728, difficulty: 1 },
    { ...before.cards[1], stabilityFast: null },
  ],
};

describe('installed FSRS 7 upgrade evidence', () => {
  it('accepts the model migration while keeping the existing schedule and receipts', () => {
    expect(() => assertUpgradeStudyRecords(before, structuredClone(after))).not.toThrow();
  });

  it.each(['due', 'reps', 'lapses', 'front', 'memory', 'receipt', 'weights'])(
    'rejects an unexpected change to %s',
    (field) => {
      const changed = structuredClone(after);
      if (field === 'due') changed.cards[0].due = 0;
      if (field === 'reps') changed.cards[0].reps = 0;
      if (field === 'lapses') changed.cards[0].lapses = 1;
      if (field === 'front') changed.cards[0].front = 'lost';
      if (field === 'memory') changed.cards[0].stabilityFast = 1;
      if (field === 'receipt') changed.reviewHistory[0].timestamp = 2000;
      if (field === 'weights') changed.courses[0].fsrsParameters.w[0] = 0;
      expect(() => assertUpgradeStudyRecords(before, changed)).toThrow();
    },
  );
});
