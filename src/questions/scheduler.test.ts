import { describe, expect, it } from 'vitest';
import type { FsrsParameters, Grade } from '../db/types';
import { defaultFsrsParameters } from '../fsrs/params';
import type { FixedQuestionDefinition, QuestionAttempt, QuestionScheduleState } from './types';
import {
  questionSchedulerConfigFingerprint,
  replayQuestionSchedule,
  scheduleQuestionReview,
} from './scheduler';

const NOW = Date.UTC(2026, 7, 24, 12);

function newSchedule(): QuestionScheduleState {
  return {
    stability: null,
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
