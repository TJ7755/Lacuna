import { describe, expect, it } from 'vitest';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import { makeEngine, applyReview } from '@lacuna/core/fsrs/fsrs';
import { reviewHistoryEntryForCard } from '@lacuna/core/db/reviewHistory';
import { card, course } from '../sync/mergeSnapshots.testFixtures';
import { migrateFsrs7Cards, migrateFsrs7Configuration } from './fsrs7Migration';
import { replayCards } from '../sync/snapshotReviews';

describe('FSRS7 migration', () => {
  it('replays complete canonical evidence without moving a due date or rewriting original logs', () => {
    const unit = migrateFsrs7Configuration(course('course-1'));
    const original = card('learnt');
    const engine = makeEngine(defaultFsrsParameters());
    const first = applyReview(engine, original, 3, 1000);
    const log = {
      timestamp: 1000,
      grade: 3 as const,
      responseTimeSec: 2,
      distracted: false,
      stabilityBefore: null,
      stabilityAfter: 99,
      difficultyBefore: null,
      difficultyAfter: 9,
      retrievabilityAtReview: null,
    };
    const legacy = {
      ...original,
      ...first.memory,
      stability: 99,
      stabilityFast: null,
      due: 900000,
      learningSteps: 1,
      history: [],
    };
    const events = [reviewHistoryEntryForCard(legacy, log)];
    const migrated = migrateFsrs7Cards([legacy], events, [], [unit])[0];
    expect(migrated).toMatchObject({
      due: 900000,
      learningSteps: 1,
      reps: legacy.reps,
      lastReviewed: 1000,
      stability: first.memory.stability,
      stabilityFast: first.memory.stabilityFast,
    });
    expect(events[0].stabilityAfter).toBe(99);
    expect(migrated.history).toEqual([]);
  });

  it('keeps an incomplete learnt import opaque through migration and sync', () => {
    const unit = migrateFsrs7Configuration(course('course-1'));
    const legacy = card('import', {
      stability: 18,
      stabilityFast: null,
      difficulty: 4,
      state: 1,
      reps: 19,
      lapses: 2,
      learningSteps: 1,
      lastReviewed: 1000,
      due: 900000,
    });
    expect(migrateFsrs7Cards([legacy], [], [], [unit])[0]).toEqual(legacy);
    expect(replayCards([legacy], [], [], [unit])[0]).toEqual(legacy);
    const reviewed = applyReview(makeEngine(unit.fsrsParameters), legacy, 3, 2000);
    expect(reviewed.retrievabilityAtReview).toBeNull();
    expect(reviewed.memory.stabilityFast).toBeGreaterThan(0);
    expect(reviewed.memory.reps).toBe(20);
    expect(reviewed.memory.lapses).toBe(2);
  });
});

it('does not infer complete post-reset memory from a retained last answer', () => {
  const legacy = card('reset-tail', {
    stability: 15,
    difficulty: 4,
    lastReviewed: 3000,
    due: 9000,
    reps: 12,
    scheduleEdits: [{ at: 1000, kind: 'reset' }],
  });
  const event = reviewHistoryEntryForCard(legacy, {
    timestamp: 3000,
    grade: 3,
    responseTimeSec: 1,
    distracted: false,
    stabilityBefore: 4,
    stabilityAfter: 15,
    difficultyBefore: 4,
    difficultyAfter: 4,
    retrievabilityAtReview: 0.8,
  });
  expect(migrateFsrs7Cards([legacy], [event], [], [course('course-1')])[0]).toEqual(legacy);
});

it('replays concurrent first FSRS7 answers from the opaque baseline in either delivery order', () => {
  const baseline = {
    stability: 20,
    stabilityFast: null,
    difficulty: 4,
    lastReviewed: 1000,
    due: 9000,
    reps: 12,
    lapses: 2,
    state: 2 as const,
    scheduledDays: 10,
    learningSteps: 0,
  };
  const opaque = card('opaque', {
    ...baseline,
    scheduleEdits: [
      { at: 500, kind: 'reset' },
      { at: 1500, kind: 'due', due: 9000 },
    ],
  });
  const engine = makeEngine(defaultFsrsParameters());
  const answers = [2000, 3000].map((timestamp) => {
    const result = applyReview(engine, opaque, 3, timestamp);
    const log = {
      timestamp,
      grade: 3 as const,
      responseTimeSec: 1,
      distracted: false,
      stabilityBefore: baseline.stability,
      stabilityAfter: result.memory.stability,
      difficultyBefore: baseline.difficulty,
      difficultyAfter: result.memory.difficulty,
      retrievabilityAtReview: null,
      memoryOrigin: baseline,
    };
    return { card: { ...opaque, ...result.memory }, event: reviewHistoryEntryForCard(opaque, log) };
  });
  const expected = applyReview(engine, answers[0].card, 3, 3000).memory;
  const events = [
    reviewHistoryEntryForCard(opaque, {
      timestamp: 900,
      grade: 3,
      responseTimeSec: 1,
      distracted: false,
      stabilityBefore: 10,
      stabilityAfter: 20,
      difficultyBefore: 4,
      difficultyAfter: 4,
      retrievabilityAtReview: null,
    }),
    ...answers.map((answer) => answer.event),
  ];
  const merged = replayCards([answers[1].card], events, [], [course('course-1')])[0];
  expect(merged).toMatchObject({ ...expected, reps: 14, lapses: 2 });
  expect(replayCards([answers[0].card], events.toReversed(), [], [course('course-1')])[0]).toEqual(
    merged,
  );
  expect(replayCards([merged], events, [], [course('course-1')])[0]).toEqual(merged);
});

it('keeps truncated post-origin history opaque when reconstructing migrated memory', () => {
  const legacy = card('truncated', { stability: 20, difficulty: 4, lastReviewed: 3000, reps: 14 });
  const memoryOrigin = {
    stability: 20,
    stabilityFast: null,
    difficulty: 4,
    lastReviewed: 1000,
    due: 9000,
    reps: 12,
    lapses: 2,
    state: 2 as const,
    scheduledDays: 10,
    learningSteps: 0,
  };
  const event = reviewHistoryEntryForCard(legacy, {
    timestamp: 2000,
    grade: 3,
    responseTimeSec: 1,
    distracted: false,
    stabilityBefore: 20,
    stabilityAfter: 3,
    difficultyBefore: 4,
    difficultyAfter: 4,
    retrievabilityAtReview: null,
    memoryOrigin,
  });
  expect(migrateFsrs7Cards([legacy], [event], [], [course('course-1')])[0]).toEqual(legacy);
});

it('applies a newly synced real answer and a later manual due date without replaying an unknown prefix', () => {
  const opaque = card('partial-sync', {
    stability: 20,
    difficulty: 4,
    lastReviewed: 1000,
    reps: 12,
    state: 2,
    due: 9000,
    scheduleEdits: [
      { at: 500, kind: 'due', due: 9000 },
      { at: 2500, kind: 'due', due: 12000 },
    ],
  });
  const log = {
    timestamp: 2000,
    grade: 3 as const,
    responseTimeSec: 1,
    distracted: false,
    stabilityBefore: 20,
    stabilityAfter: 3,
    difficultyBefore: 4,
    difficultyAfter: 4,
    retrievabilityAtReview: null,
  };
  const events = [
    reviewHistoryEntryForCard(opaque, { ...log, timestamp: 900 }),
    reviewHistoryEntryForCard(opaque, log),
  ];
  const result = replayCards([opaque], events, [], [course('course-1')])[0];
  expect(result).toMatchObject({
    reps: 13,
    lastReviewed: 2000,
    due: 12000,
    stabilityFast: expect.any(Number),
  });
  expect(result.history).toHaveLength(2);
  expect(replayCards([result], events, [], [course('course-1')])[0]).toEqual(result);
});
