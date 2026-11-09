import { describe, expect, it } from 'vitest';
import type { Card } from '@lacuna/core/db/types';
import { DUE_REVIEW_STEP } from './studyFlowPlanner';
import { planStudySession } from './studySessionPlan';

const card = (reviewed: boolean) => ({ lastReviewed: reviewed ? 1 : null }) as Card;

describe('planStudySession', () => {
  it('previews one recommended block without guessing the later queue', () => {
    const plan = planStudySession({
      decision: { kind: 'step', step: { kind: 'lesson', lessonId: 'l1', label: 'Cell structure' } },
      lessonCardsById: new Map([['l1', [card(true), card(true), card(false)]]]),
      meanReviewSeconds: 12,
    });
    expect(plan.steps).toEqual([
      // Two reviews plus one new card counted three times: 60 seconds.
      {
        key: 'lesson:l1',
        title: 'Cell structure',
        detail: 'Learn 3 cards (1 new)',
        minutes: 1,
      },
    ]);
    expect(plan.totalMinutes).toBe(1);
    expect(plan.startsWithDueReview).toBe(false);
  });

  it('counts a wholly new lesson once rather than as cards and new cards', () => {
    const plan = planStudySession({
      decision: { kind: 'step', step: { kind: 'lesson', lessonId: 'l1', label: 'Cells' } },
      lessonCardsById: new Map([['l1', [card(false), card(false)]]]),
      meanReviewSeconds: 12,
    });
    expect(plan.steps[0]?.detail).toBe('Learn 2 new cards');
  });

  it('previews scheduled reviews as card practice without a block estimate', () => {
    const plan = planStudySession({
      decision: { kind: 'step', step: DUE_REVIEW_STEP },
      lessonCardsById: new Map(),
      meanReviewSeconds: 8,
    });
    expect(plan.steps).toEqual([
      {
        key: 'practice:due-review',
        title: 'Card practice',
      },
    ]);
    expect(plan.startsWithDueReview).toBe(true);
    expect(plan.totalMinutes).toBeUndefined();
  });

  it('leaves the total out when a step has nothing to estimate from', () => {
    const plan = planStudySession({
      decision: { kind: 'step', step: { kind: 'lesson', lessonId: 'l1', label: 'Intro' } },
      lessonCardsById: new Map([['l1', []]]),
      meanReviewSeconds: 8,
    });
    expect(plan.steps).toEqual([{ key: 'lesson:l1', title: 'Intro', detail: 'Read notes' }]);
    expect(plan.totalMinutes).toBeUndefined();
  });

  it('previews assessment practice under the same card activity', () => {
    const plan = planStudySession({
      decision: {
        kind: 'step',
        step: {
          kind: 'practice',
          nodeKey: 'p1',
          mode: 'assessment',
          label: 'Prepare for Steady retention',
        },
      },
      lessonCardsById: new Map(),
      meanReviewSeconds: 8,
    });
    expect(plan.steps).toEqual([
      {
        key: 'practice:p1',
        title: 'Card practice',
      },
    ]);
  });

  it('plans nothing when the course has nothing to study', () => {
    expect(
      planStudySession({
        decision: { kind: 'complete' },
        lessonCardsById: new Map(),
        meanReviewSeconds: 8,
      }).steps,
    ).toEqual([]);
  });
});
