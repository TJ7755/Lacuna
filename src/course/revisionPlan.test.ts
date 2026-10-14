import { describe, expect, it } from 'vitest';
import type { RevisionPlan } from '../db/types';
import {
  applyPendingRevisionPlanInput,
  applyRevisionPlanInput,
  buildRevisionWindows,
  type ResolvedRevisionPlanInput,
} from './revisionPlan';

const now = Date.parse('2026-07-17T08:00:00Z');

function makePlan(): RevisionPlan {
  const input: RevisionPlan['input'] = {
    coverageVersion: 'coverage-1',
    deadlineAt: Date.parse('2026-07-19T12:00:00Z'),
    timeZone: 'UTC',
    reachedLessonIds: ['lesson'],
    exposureVersion: 'exposure-1',
    availabilityVersion: 'availability-1',
    reviewEvidenceVersion: 'reviews-1',
    projection: {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    },
  };
  return {
    id: 'plan',
    assessmentId: 'assessment',
    courseId: 'course',
    status: 'active',
    revision: 1,
    input,
    scope: {
      coveredLessonIds: ['lesson'],
      excludedCardIds: [],
      eligibleCardIds: ['card'],
      unavailableCardIds: [],
      unreachedLessonIds: [],
      untaughtLessonIds: [],
    },
    cardStates: [{ cardId: 'card', status: 'eligible' }],
    windows: buildRevisionWindows('plan', 20, now, input.deadlineAt, input.timeZone),
    completedSessions: [],
    replans: [],
    createdAt: now,
    updatedAt: now,
  };
}

function extendDeadline(plan: RevisionPlan): ResolvedRevisionPlanInput {
  return {
    input: { ...plan.input, deadlineAt: Date.parse('2026-07-20T12:00:00Z') },
    scope: plan.scope,
    cardStates: plan.cardStates,
  };
}

describe('revision plan replanning', () => {
  it.each(['immediate', 'deferred'] as const)(
    'keeps a completed day closed after an %s replan',
    (mode) => {
      const plan = makePlan();
      const completed = { ...plan.windows[0], status: 'completed' as const, completedAt: now + 30 };
      plan.windows[0] = completed;
      plan.windows[1].budgetMinutes = 35;
      const resolved = extendDeadline(plan);
      if (mode === 'deferred') {
        plan.pendingReplan = {
          ...resolved,
          reasons: ['assessment-deadline-changed'],
          requestedAt: now + 20,
        };
      }
      const updated =
        mode === 'deferred'
          ? applyPendingRevisionPlanInput(plan, now + 30)
          : applyRevisionPlanInput(plan, resolved, now + 30);

      expect(updated.windows.filter((window) => window.day === completed.day)).toEqual([completed]);
      expect(new Set(updated.windows.map((window) => window.id)).size).toBe(updated.windows.length);
      expect(updated.windows.find((window) => window.day === '2026-07-18')?.budgetMinutes).toBe(35);
      expect(updated.windows.some((window) => window.day === '2026-07-20')).toBe(true);
    },
  );
});
