import { FSRS6_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-6';
import { mergeQuestionCollections } from './merge';
import { course, concept, links } from '../sync/mergeSnapshots.questions.testFixtures';
import { migrateFsrs7Questions } from './fsrs7Migration';
import { describe, expect, it } from 'vitest';
import type { FsrsParameters, Grade } from '@lacuna/core/db/types';
import { defaultFsrsParameters } from '@lacuna/core/fsrs/params';
import type {
  FixedQuestionDefinition,
  QuestionAttempt,
  QuestionScheduleState,
} from '@lacuna/core/questions/types';
import {
  questionSchedulerConfigFingerprint,
  replayQuestionSchedule,
  scheduleQuestionReview,
} from '@lacuna/core/questions/scheduler';

const NOW = Date.UTC(2026, 7, 24, 12);

function newSchedule(): QuestionScheduleState {
  return {
    stability: null,
    stabilityFast: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
  };
}

function question(
  baseline: FixedQuestionDefinition['scheduleEpoch']['baseline'] = { kind: 'new' },
): FixedQuestionDefinition {
  return {
    id: 'question-1',
    courseId: 'course-1',
    primaryLessonId: null,
    additionalLessonIds: [],
    name: 'Solve x + 1 = 2',
    tags: [],
    suspended: false,
    contentVersion: 1,
    contentRevisionId: 'content-1',
    authoringRevisionId: 'authoring-1',
    authoringUpdatedAt: NOW,
    scheduleEpoch: {
      id: 'epoch-1',
      startedAt: NOW,
      reason: baseline.kind === 'new' ? 'created' : 'legacy-card-migration',
      baseline,
    },
    scheduleUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'fixed',
    prompt: 'Solve x + 1 = 2',
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
    explanation: 'Subtract one.',
    explanationStatus: 'authored',
    ...newSchedule(),
  };
}

function answeredAttempt(
  id: string,
  answeredAt: number,
  grade: Grade,
  overrides: Partial<QuestionAttempt> = {},
): QuestionAttempt {
  return {
    id,
    questionId: 'question-1',
    courseId: 'course-1',
    contentVersion: 1,
    contentRevisionId: 'content-1',
    scheduleEpochId: 'epoch-1',
    purpose: 'post-instruction',
    shownAt: answeredAt - 1_000,
    answeredAt,
    updatedAt: answeredAt,
    status: 'answered',
    receiptOrigin: 'native',
    renderedPrompt: 'Solve x + 1 = 2',
    resolvedPayload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '1' } },
    renderedExplanation: 'Subtract one.',
    submittedAnswer: '1',
    marksEarned: grade === 1 ? 0 : 1,
    marksAvailable: 1,
    grade,
    scheduleEffect: { kind: 'replay', grade },
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('Question scheduler', () => {
  it('replays immutable historical configs with FSRS-7 defaults and the recorded scheduling policy', () => {
    const parameters = {
      ...defaultFsrsParameters(),
      w: [...FSRS6_DEFAULT_WEIGHTS],
      requestRetention: 0.94,
      learning_steps: ['2m'],
      enable_fuzz: false,
    };
    const receipt = structuredClone(parameters);
    const result = scheduleQuestionReview(newSchedule(), 3, parameters, NOW);
    expect(result.schedulerConfig.w).toHaveLength(34);
    expect(result.schedulerConfig).toMatchObject({
      requestRetention: 0.94,
      learning_steps: ['2m'],
    });
    expect(result.schedule.stabilityFast).toBeGreaterThan(0);
    expect(parameters).toEqual(receipt);
    // Frozen FSRS-6 receipt fingerprint remains valid while replay uses FSRS-7.
    expect(questionSchedulerConfigFingerprint(parameters)).toBe('qfsrs1:a8b085f5');
    const attempt = answeredAttempt('legacy-config', NOW, 3, {
      schedulerVersion: 'fsrs-6-question-v1',
      schedulerConfig: parameters,
      schedulerConfigFingerprint: 'qfsrs1:a8b085f5',
    });
    expect(replayQuestionSchedule(question(), [attempt], defaultFsrsParameters())).toEqual(
      result.schedule,
    );
  });

  it('applies FSRS with fuzz disabled and leaves the input state and parameters untouched', () => {
    const state = newSchedule();
    const parameters = defaultFsrsParameters();
    parameters.enable_fuzz = true;

    const first = scheduleQuestionReview(state, 3, parameters, NOW);
    const second = scheduleQuestionReview(state, 3, parameters, NOW);

    expect(first).toEqual(second);
    expect(first.schedule.reps).toBe(1);
    expect(first.schedule.lastReviewed).toBe(NOW);
    expect(first.retrievabilityAtAttempt).toBeNull();
    expect(first.schedulerConfig.enable_fuzz).toBe(false);
    expect(first.schedulerConfig).not.toBe(parameters);
    expect(parameters.enable_fuzz).toBe(true);
    expect(state).toEqual(newSchedule());
  });

  it('fingerprints every scheduling parameter in a stable property order', () => {
    const first = defaultFsrsParameters();
    const reordered: FsrsParameters = {
      relearning_steps: [...first.relearning_steps],
      maximum_interval: first.maximum_interval,
      enable_fuzz: true,
      learning_steps: [...first.learning_steps],
      requestRetention: first.requestRetention,
      w: [...first.w],
    };

    expect(questionSchedulerConfigFingerprint(first)).toBe(
      questionSchedulerConfigFingerprint(reordered),
    );
    expect(
      questionSchedulerConfigFingerprint({
        ...first,
        requestRetention: first.requestRetention - 0.01,
      }),
    ).not.toBe(questionSchedulerConfigFingerprint(first));
    expect(questionSchedulerConfigFingerprint({ ...first, learning_steps: ['2m'] })).not.toBe(
      questionSchedulerConfigFingerprint(first),
    );
  });

  it('replays active answered attempts in timestamp and id order using recorded config changes', () => {
    const firstParameters = defaultFsrsParameters();
    const secondParameters = { ...defaultFsrsParameters(), requestRetention: 0.92 };
    const firstTime = NOW;
    const secondTime = NOW + 86_400_000;
    const firstResult = scheduleQuestionReview(newSchedule(), 3, firstParameters, firstTime);
    const expected = scheduleQuestionReview(firstResult.schedule, 1, secondParameters, secondTime);
    const attempts = [
      answeredAttempt('b', secondTime, 1, {
        schedulerConfig: expected.schedulerConfig,
        schedulerConfigFingerprint: questionSchedulerConfigFingerprint(secondParameters),
      }),
      answeredAttempt('a', firstTime, 3, {
        schedulerConfig: firstResult.schedulerConfig,
        schedulerConfigFingerprint: firstResult.schedulerConfigFingerprint,
      }),
      answeredAttempt('undone', secondTime + 1, 3, { undoneAt: secondTime + 2 }),
      answeredAttempt('old-epoch', secondTime + 2, 3, { scheduleEpochId: 'epoch-old' }),
      answeredAttempt('shown', secondTime + 3, 3, {
        status: 'shown',
        answeredAt: undefined,
        scheduleEffect: { kind: 'none' },
      }),
    ];

    expect(replayQuestionSchedule(question(), attempts, firstParameters)).toEqual(
      expected.schedule,
    );
  });

  it('starts opaque migrations at their copied baseline and excludes evidence already in it', () => {
    const parameters = defaultFsrsParameters();
    const initial = scheduleQuestionReview(newSchedule(), 3, parameters, NOW).schedule;
    const baselineQuestion = question({
      kind: 'legacy-opaque',
      sourceCardId: 'card-1',
      state: initial,
      reason: 'missing-history',
    });
    const nextTime = NOW + 86_400_000;
    const expected = scheduleQuestionReview(initial, 1, parameters, nextTime).schedule;

    expect(
      replayQuestionSchedule(
        baselineQuestion,
        [
          answeredAttempt('legacy', NOW, 3, {
            scheduleEffect: { kind: 'included-in-opaque-baseline' },
          }),
          answeredAttempt('native', nextTime, 1),
        ],
        parameters,
      ),
    ).toEqual(expected);
  });
});

describe('Question FSRS-7 migration', () => {
  it('rebuilds both traces from complete answer receipts without moving the schedule or changing evidence', () => {
    const lastReviewed = NOW + 0.25 * 86_400_000;
    const legacy = {
      ...question(),
      stability: 99,
      difficulty: 9,
      reps: 2,
      lapses: 1,
      lastReviewed,
      due: NOW + 10 * 86_400_000,
      state: 2 as const,
      scheduledDays: 10,
      learningSteps: 1,
    };
    const attempts = [answeredAttempt('a', NOW, 3), answeredAttempt('b', lastReviewed, 1)];
    const originalEvidence = structuredClone(attempts);
    const [migrated] = migrateFsrs7Questions([legacy], attempts, []);
    expect(migrated.stability).toBeCloseTo(1.1705386638641357, 5);
    expect(migrated.stabilityFast).toBeCloseTo(0.2061578780412674, 5);
    expect(migrated).toMatchObject({
      due: legacy.due,
      state: 2,
      scheduledDays: 10,
      learningSteps: 1,
      reps: 2,
      lapses: 1,
      lastReviewed,
    });
    expect(attempts).toEqual(originalEvidence);
    expect(legacy.stabilityFast).toBeNull();
  });

  it('keeps opaque memory and its schedule until a real answer initialises both traces', () => {
    const state = {
      ...newSchedule(),
      stability: 18,
      difficulty: 4,
      reps: 19,
      lapses: 2,
      lastReviewed: NOW,
      due: NOW + 86_400_000,
      state: 1 as const,
      learningSteps: 1,
    };
    const legacy = {
      ...question({ kind: 'legacy-opaque', sourceCardId: 'old', state, reason: 'missing-history' }),
      ...state,
    };
    const [migrated] = migrateFsrs7Questions([legacy], [], []);
    expect(migrated).toEqual(legacy);
    expect(replayQuestionSchedule(migrated, [], defaultFsrsParameters())).toEqual(state);
    const next = scheduleQuestionReview(migrated, 3, defaultFsrsParameters(), NOW + 60_000);
    expect(next.retrievabilityAtAttempt).toBeNull();
    expect(next.schedule.stabilityFast).toBeGreaterThan(0);
    expect(next.schedule.reps).toBe(20);
    expect(next.schedule.lapses).toBe(2);
    const withAnswer = { ...migrated, ...next.schedule, stabilityFast: null, due: migrated.due };
    const [replayed] = migrateFsrs7Questions(
      [withAnswer],
      [answeredAttempt('after-baseline', NOW + 60_000, 3)],
      [],
    );
    expect(replayed.stabilityFast).toBeCloseTo(3.13768, 5);
    expect(replayed.due).toBe(migrated.due);
    expect(replayed.reps).toBe(20);
  });
});

describe('Migrated Question import and sync', () => {
  function imported(row: FixedQuestionDefinition, attempts: QuestionAttempt[]) {
    return {
      concepts: [concept()],
      questions: [row],
      questionConcepts: [links()],
      questionAttempts: attempts,
    };
  }
  const empty = { concepts: [], questions: [], questionConcepts: [], questionAttempts: [] };
  it('keeps a migrated due date and learning progress when receipts are unchanged', () => {
    const legacy = {
      ...question(),
      stability: 10,
      difficulty: 4,
      reps: 1,
      lastReviewed: NOW,
      due: NOW + 10 * 86400000,
      scheduledDays: 10,
      state: 2 as const,
      learningSteps: 1,
    };
    const receipts = [answeredAttempt('first', NOW, 3)];
    const result = mergeQuestionCollections(empty, imported(legacy, receipts), [course()], []);
    expect(result.questions[0]).toMatchObject({
      due: legacy.due,
      scheduledDays: 10,
      state: 2,
      learningSteps: 1,
      reps: 1,
    });
    expect(result.questionAttempts).toEqual(receipts);
    expect(mergeQuestionCollections(result, result, [course()], [])).toEqual(result);
  });
  it('retains an incomplete prefix through import and replays two subsequent answers after it', () => {
    const legacy = {
      ...question(),
      stability: 10,
      difficulty: 4,
      reps: 12,
      lastReviewed: NOW,
      due: NOW + 86400000,
      state: 1 as const,
      learningSteps: 1,
    };
    const importedState = mergeQuestionCollections(empty, imported(legacy, []), [course()], []);
    const migrated = importedState.questions[0];
    expect(migrated).toMatchObject({
      reps: 12,
      due: legacy.due,
      state: 1,
      learningSteps: 1,
      stabilityFast: null,
    });
    const first = scheduleQuestionReview(
      migrated,
      3,
      defaultFsrsParameters(),
      NOW + 60000,
    ).schedule;
    const second = scheduleQuestionReview(
      migrated,
      1,
      defaultFsrsParameters(),
      NOW + 120000,
    ).schedule;
    const left = {
      ...importedState,
      questions: [{ ...migrated, ...first }],
      questionAttempts: [answeredAttempt('left', NOW + 60000, 3)],
    };
    const right = {
      ...importedState,
      questions: [{ ...migrated, ...second }],
      questionAttempts: [answeredAttempt('right', NOW + 120000, 1)],
    };
    const merged = mergeQuestionCollections(left, right, [course()], []);
    expect(merged.questions[0]).toMatchObject({
      reps: 14,
      lastReviewed: NOW + 120000,
      stabilityFast: expect.any(Number),
    });
    expect(mergeQuestionCollections(right, left, [course()], [])).toEqual(merged);
    expect(mergeQuestionCollections(merged, merged, [course()], [])).toEqual(merged);
  });
});
