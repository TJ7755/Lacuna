import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  upsertLessonCardExposure,
} from '../../db/repository';
import { createOrResumeRevisionPlan } from '../../db/revisionPlanRepository';
import type { RevisionProjection } from '@lacuna/core/db/types';
import { persistSessionCompletion } from './sessionCompletionPersistence';
import type { SessionSummary } from '../../components/learn/types';

const fallback: RevisionProjection = {
  projectionMode: 'fsrs-6-practice-fallback',
  memoryModelVersion: 'fsrs-6',
  fallbackReason: 'missing',
};

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('persistSessionCompletion', () => {
  it('preserves an unreached goal when a revision window ends with partial coverage', async () => {
    const now = Date.parse('2026-07-17T08:00:00Z');
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const firstCard = await createLessonCard(course.id, lesson.id, 'front_back', 'Q1', 'A1');
    const secondCard = await createLessonCard(course.id, lesson.id, 'front_back', 'Q2', 'A2');
    await upsertLessonCardExposure(lesson.id, firstCard.id, now - 1_000);
    await upsertLessonCardExposure(lesson.id, secondCard.id, now - 1_000);
    const assessment = await createCourseAssessment(
      course.id,
      'Paper 1',
      Date.parse('2026-07-19T12:00:00Z'),
      { timeZone: 'UTC' },
    );
    const plan = await createOrResumeRevisionPlan(assessment.id, 20, fallback, now);
    const windowId = plan.windows[0].id;

    // The window budget ran out after one of two eligible cards: the caller
    // proposes reachedGoal false and the delivery must not claim otherwise.
    const nextSummary: SessionSummary = {
      events: [],
      masteryBefore: 0,
      masteryAfter: 0,
      objectiveLabel: 'Revision',
      focusFraction: 1,
      reachedGoal: false,
      limitReached: false,
      timeLimitReached: true,
    };
    const { deliveredSummary } = await persistSessionCompletion(nextSummary, windowId, () => ({
      revisionPlan: plan,
      initialRevision: plan.revision,
      sessionId: 'session-1',
      startedAt: now,
      covered: new Set([firstCard.id]),
      improved: new Set([firstCard.id]),
      parked: new Set<string>(),
      reviewEventIds: ['event-1'],
      context: null,
      cards: [],
      practice: null,
      ratchetCourseId: null,
      ratchetLessonId: null,
    }));

    expect(deliveredSummary.reachedGoal).toBe(false);
    expect(deliveredSummary.revision).toMatchObject({ cardsCovered: 1, cardsImproved: 1 });
  });
});
