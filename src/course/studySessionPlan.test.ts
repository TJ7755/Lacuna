import { describe, expect, it } from 'vitest';
import type { Card } from '../db/types';
import type { CourseStudyFlowSnapshot, StudyFlowPracticeState } from './studyFlowSnapshot';
import { DUE_REVIEW_STEP } from './studyFlowPlanner';
import { planStudySession } from './studySessionPlan';

function snapshot(due: number, practices: Partial<StudyFlowPracticeState>[] = []) {
  return {
    recurringPracticeEligibleCount: due,
    practiceByKey: new Map(practices.map((p) => [p.nodeKey!, p as StudyFlowPracticeState])),
  } as unknown as CourseStudyFlowSnapshot;
}

const card = (reviewed: boolean) => ({ lastReviewed: reviewed ? 1 : null }) as Card;

describe('planStudySession', () => {
  it('previews a lesson and the due reviews offered after it, with estimates', () => {
    const plan = planStudySession({
      decision: { kind: 'step', step: { kind: 'lesson', lessonId: 'l1', label: 'Cell structure' } },
      snapshot: snapshot(6),
      lessonCardsById: new Map([['l1', [card(true), card(true), card(false)]]]),
      meanReviewSeconds: 12,
    });
    expect(plan.steps).toEqual([
      // Two reviews plus one new card counted three times: 60 seconds.
      { key: 'lesson:l1', title: 'Learn Cell structure', detail: '3 cards, 1 new', minutes: 1 },
      { key: 'practice:due-review', title: 'Review due cards', detail: '6 cards, offered next', minutes: 2 },
    ]);
    expect(plan.totalMinutes).toBe(3);
    expect(plan.startsWithDueReview).toBe(false);
  });

  it('counts a wholly new lesson once rather than as cards and new cards', () => {
    const plan = planStudySession({
      decision: { kind: 'step', step: { kind: 'lesson', lessonId: 'l1', label: 'Cells' } },
      snapshot: snapshot(0),
      lessonCardsById: new Map([['l1', [card(false), card(false)]]]),
      meanReviewSeconds: 12,
    });
    expect(plan.steps[0]?.detail).toBe('2 new cards');
  });

  it('lists due reviews once when they are the step itself', () => {
    const plan = planStudySession({
      decision: { kind: 'step', step: DUE_REVIEW_STEP },
      snapshot: snapshot(30),
      lessonCardsById: new Map(),
      meanReviewSeconds: 8,
    });
    expect(plan.steps).toEqual([
      { key: 'practice:due-review', title: 'Review due cards', detail: '30 cards', minutes: 4 },
    ]);
    expect(plan.startsWithDueReview).toBe(true);
  });

  it('leaves the total out when a step has nothing to estimate from', () => {
    const plan = planStudySession({
      decision: { kind: 'step', step: { kind: 'lesson', lessonId: 'l1', label: 'Intro' } },
      snapshot: snapshot(0),
      lessonCardsById: new Map([['l1', []]]),
      meanReviewSeconds: 8,
    });
    expect(plan.steps).toEqual([{ key: 'lesson:l1', title: 'Learn Intro', detail: 'Notes only' }]);
    expect(plan.totalMinutes).toBeUndefined();
  });

  it('counts a card practice step by its eligible cards', () => {
    const plan = planStudySession({
      decision: {
        kind: 'step',
        step: { kind: 'practice', nodeKey: 'p1', mode: 'curricular', label: 'Card practice' },
      },
      snapshot: snapshot(0, [{ nodeKey: 'p1', eligibleCount: 1 }]),
      lessonCardsById: new Map(),
      meanReviewSeconds: 8,
    });
    expect(plan.steps).toEqual([
      { key: 'practice:p1', title: 'Card practice', detail: '1 card', minutes: 1 },
    ]);
  });

  it('plans nothing when the course has nothing to study', () => {
    expect(
      planStudySession({
        decision: { kind: 'complete' },
        snapshot: snapshot(0),
        lessonCardsById: new Map(),
        meanReviewSeconds: 8,
      }).steps,
    ).toEqual([]);
  });
});
