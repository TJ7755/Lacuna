import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RevisionPlanInputSnapshot, RevisionProjection } from './types';
import { db } from './schema';
import {
  completeRevisionWindow,
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  createOrResumeRevisionPlan,
  refreshRevisionPlan,
  removeRevisionDay,
  setRevisionDayBudget,
  startRevisionWindow,
  updateCourseAssessment,
  upsertLessonCardExposure,
} from './repository';
import {
  buildRevisionWindows,
  revisionReplanReasons,
  resolveRevisionPlanInput,
} from '../course/revisionPlan';

const fallback: RevisionProjection = {
  projectionMode: 'fsrs-6-practice-fallback',
  memoryModelVersion: 'fsrs-6',
  fallbackReason: 'missing',
};

async function reset() {
  await Promise.all([
    db.revisionPlans.clear(),
    db.courseAssessments.clear(),
    db.lessonCardExposures.clear(),
    db.lessonCompletions.clear(),
    db.lessonCards.clear(),
    db.cards.clear(),
    db.lessons.clear(),
    db.courses.clear(),
    db.decks.clear(),
    db.userPerformance.clear(),
    db.sessionHistory.clear(),
  ]);
}

async function fixture() {
  const now = Date.parse('2026-07-17T08:00:00Z');
  const course = await createCourse('Biology');
  const first = await createLesson(course.id, 'Cells');
  const second = await createLesson(course.id, 'Genetics');
  const firstCard = await createLessonCard(course.id, first.id, 'front_back', 'Q1', 'A1');
  const secondCard = await createLessonCard(course.id, second.id, 'front_back', 'Q2', 'A2');
  await upsertLessonCardExposure(first.id, firstCard.id, now - 1_000);
  const assessment = await createCourseAssessment(
    course.id,
    'Paper 1',
    Date.parse('2026-07-19T12:00:00Z'),
    {
      timeZone: 'UTC',
      afterLessonId: second.id,
      coverageMode: 'prefix',
    },
  );
  return { now, course, first, second, firstCard, secondCard, assessment };
}

describe('revision plan lifecycle', () => {
  beforeEach(reset);

  it('creates one plan per assessment with inherited daily windows and a frozen scope', async () => {
    const f = await fixture();
    const plan = await createOrResumeRevisionPlan(f.assessment.id, 20, fallback, f.now);
    const resumed = await createOrResumeRevisionPlan(f.assessment.id, 45, fallback, f.now);

    expect(resumed.id).toBe(plan.id);
    expect(await db.revisionPlans.count()).toBe(1);
    expect(plan.windows.map((window) => [window.day, window.budgetMinutes])).toEqual([
      ['2026-07-17', 20],
      ['2026-07-18', 20],
      ['2026-07-19', 20],
    ]);
    expect(plan.scope.coveredLessonIds).toEqual([f.first.id, f.second.id]);
    expect(plan.scope.eligibleCardIds).toEqual([f.firstCard.id]);
    expect(plan.scope.untaughtLessonIds).toContain(f.second.id);
    expect(plan.input.projection).toEqual(fallback);
  });

  it('edits and removes individual scheduled days idempotently', async () => {
    const f = await fixture();
    const plan = await createOrResumeRevisionPlan(f.assessment.id, 20, fallback, f.now);
    const edited = await setRevisionDayBudget(plan.id, '2026-07-18', 35, f.now + 1);
    expect(edited.windows.find((window) => window.day === '2026-07-18')?.budgetMinutes).toBe(35);
    const removed = await removeRevisionDay(plan.id, '2026-07-18', f.now + 2);
    const replayed = await removeRevisionDay(plan.id, '2026-07-18', f.now + 3);
    expect(removed.windows.some((window) => window.day === '2026-07-18')).toBe(false);
    expect(replayed).toEqual(removed);
    await expect(setRevisionDayBudget(plan.id, '2026-07-20', 10, f.now + 4)).rejects.toThrow(
      'between today and the assessment deadline',
    );
  });

  it('defers an explained replan until the active window closes and preserves its revision', async () => {
    const f = await fixture();
    const plan = await createOrResumeRevisionPlan(f.assessment.id, 20, fallback, f.now);
    const active = await startRevisionWindow(plan.id, plan.windows[0].id, f.now + 10);
    await updateCourseAssessment(f.assessment.id, {
      examDate: Date.parse('2026-07-20T12:00:00Z'),
    });
    const pending = await refreshRevisionPlan(plan.id, fallback, f.now + 20);

    expect(pending.revision).toBe(1);
    expect(pending.windows.find((window) => window.id === active.windows[0].id)).toEqual(
      active.windows[0],
    );
    expect(pending.pendingReplan?.reasons).toEqual(['assessment-deadline-changed']);

    const session = {
      id: 'session-1',
      windowId: plan.windows[0].id,
      startedAt: f.now + 10,
      completedAt: f.now + 30,
      cardIds: [f.firstCard.id],
      reviewEventIds: ['event-1'],
    };
    const applied = await completeRevisionWindow(plan.id, plan.windows[0].id, session, f.now + 30);
    const replayed = await completeRevisionWindow(plan.id, plan.windows[0].id, session, f.now + 30);
    expect(applied.revision).toBe(2);
    expect(applied.pendingReplan).toBeUndefined();
    expect(applied.replans[0]).toEqual(
      expect.objectContaining({
        reasons: ['assessment-deadline-changed'],
        explanation: 'the assessment deadline moved',
      }),
    );
    expect(applied.windows.some((window) => window.day === '2026-07-20')).toBe(true);
    expect(replayed.completedSessions).toHaveLength(1);
  });

  it('detects every replan trigger in stable order', () => {
    const previous: RevisionPlanInputSnapshot = {
      coverageVersion: 'coverage-1',
      deadlineAt: 1,
      timeZone: 'UTC',
      reachedLessonIds: ['l1'],
      exposureVersion: 'exposure-1',
      availabilityVersion: 'availability-1',
      reviewEvidenceVersion: 'reviews-1',
      projection: fallback,
    };
    const next: RevisionPlanInputSnapshot = {
      coverageVersion: 'coverage-2',
      deadlineAt: 2,
      timeZone: 'Europe/London',
      reachedLessonIds: ['l1', 'l2'],
      exposureVersion: 'exposure-2',
      availabilityVersion: 'availability-2',
      reviewEvidenceVersion: 'reviews-2',
      projection: { projectionMode: 'memory-model', memoryModelVersion: 'model-1' },
    };
    expect(revisionReplanReasons(previous, next)).toEqual([
      'assessment-coverage-changed',
      'assessment-deadline-changed',
      'assessment-time-zone-changed',
      'memory-model-changed',
      'reached-lessons-changed',
      'card-exposure-changed',
      'card-availability-changed',
      'review-evidence-changed',
    ]);
  });

  it('keeps unavailable cards out of the eligible pool without inventing confidence', async () => {
    const f = await fixture();
    await upsertLessonCardExposure(f.second.id, f.secondCard.id, f.now - 500);
    await db.cards.update(f.secondCard.id, { suspended: true });
    const cards = await db.cards.where('courseId').equals(f.course.id).toArray();
    const resolved = resolveRevisionPlanInput({
      assessment: f.assessment,
      lessons: [f.first, f.second],
      cards,
      links: [],
      exposures: await db.lessonCardExposures.toArray(),
      completions: [],
      reachedLessonIds: new Set([f.first.id, f.second.id]),
      projection: { ...fallback, fallbackReason: 'corrupt' },
      now: f.now,
    });
    expect(resolved.scope.eligibleCardIds).toEqual([f.firstCard.id]);
    expect(resolved.scope.unavailableCardIds).toEqual([f.secondCard.id]);
    expect(resolved.cardStates).toEqual(
      expect.arrayContaining([{ cardId: f.secondCard.id, status: 'unavailable' }]),
    );
    expect(resolved.input.projection).toEqual({
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'corrupt',
    });
    expect(resolved).not.toHaveProperty('confidence');
  });

  it('builds no windows at or after an elapsed deadline', () => {
    expect(buildRevisionWindows('plan', 20, 100, 100, 'UTC')).toEqual([]);
  });
});
