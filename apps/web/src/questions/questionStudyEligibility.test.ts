import { expect, it } from 'vitest';
import { defaultFsrsParameters, MS_PER_DAY } from '@lacuna/core/fsrs/params';
import { makeEngine, decayOf } from '../fsrs/fsrs';
import { emptyQuestionSchedule } from './scheduler';
import { questionStudyEligible } from './questionStudyEligibility';

const params = defaultFsrsParameters();
const now = 1_800_000_000_000;
const ctx = { fsrs: makeEngine(params), decay: decayOf(params), expectedGrade: 3 as const };
const memory = {
  ...emptyQuestionSchedule(),
  state: 2 as const,
  stability: 1,
  difficulty: 5,
  lastReviewed: now - MS_PER_DAY,
  due: now + 20 * MS_PER_DAY,
  reps: 1,
};

it('uses ordinary due outside the urgency window and never changes the stored boundary', () => {
  const before = structuredClone(memory);
  for (let days = 15; days < 100; days++) {
    expect(
      questionStudyEligible(memory, {
        now,
        examDate: now + days * MS_PER_DAY,
        windowDays: 14,
        ctx,
      }),
    ).toBe(false);
    expect(
      questionStudyEligible(
        { ...memory, due: now },
        { now, examDate: now + days * MS_PER_DAY, windowDays: 14, ctx },
      ),
    ).toBe(true);
  }
  expect(memory).toEqual(before);
});

it('allows worthwhile early practice but stops above target, after a recent review and within the same sitting', () => {
  const timing = { now, examDate: now + MS_PER_DAY, windowDays: 14, ctx };
  expect(questionStudyEligible(memory, timing)).toBe(true);
  expect(questionStudyEligible({ ...memory, stability: 1000 }, timing)).toBe(false);
  expect(questionStudyEligible({ ...memory, lastReviewed: now }, timing)).toBe(false);
  expect(
    questionStudyEligible(memory, { ...timing, lastPracticeAt: now, sittingStartedAt: now }),
  ).toBe(false);
  expect(
    questionStudyEligible(
      { ...memory, due: now },
      { ...timing, lastPracticeAt: now, sittingStartedAt: now },
    ),
  ).toBe(false);
});

it('retains ordinary due regardless of target while keeping new unassessed work available', () => {
  expect(
    questionStudyEligible(
      { ...memory, stability: 1000, due: now },
      { now, examDate: now + MS_PER_DAY, windowDays: 14, ctx },
    ),
  ).toBe(true);
  expect(questionStudyEligible(emptyQuestionSchedule(), { now, windowDays: 14, ctx })).toBe(true);
  expect(
    questionStudyEligible(emptyQuestionSchedule(), {
      now,
      examDate: now + MS_PER_DAY,
      windowDays: 14,
      ctx,
    }),
  ).toBe(true);
});

it('retains diagnostic ordinary-due overrides inside the urgency window', () => {
  const timing = { now, examDate: now + MS_PER_DAY, windowDays: 14, ctx, ordinaryDue: true };
  const aboveTarget = { ...memory, stability: 1000 };
  expect(questionStudyEligible(aboveTarget, timing)).toBe(true);
  expect(
    questionStudyEligible(aboveTarget, {
      ...timing,
      lastPracticeAt: now,
      sittingStartedAt: now,
    }),
  ).toBe(false);
});
