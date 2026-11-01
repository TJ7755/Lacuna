import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createPracticeNode,
  createSequence,
  markLessonComplete,
  savePracticeMilestoneProgress,
  upsertLessonCardExposure,
} from '../db/repository';
import { exportDatabase } from '../db/portability';
import { createOrResumeRevisionPlan } from '../db/revisionPlanRepository';
import { expectPeerProperties } from './mergeSnapshots.testFixtures';

describe('teaching progress peer reconciliation', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('converges linked teaching evidence, generated content and revision work without changing identities', async () => {
    const now = Date.parse('2026-07-17T08:00:00Z');
    const course = await createCourse('Biology', { examDate: now + 86_400_000 });
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
    const activity = await createPracticeNode(course.id, { type: 'manual', name: 'Revision' });
    await upsertLessonCardExposure(lesson.id, card.id, now);
    await markLessonComplete(lesson.id, now);
    await savePracticeMilestoneProgress(activity.id, course.id, 'cells-v1', 1, 2, false, now);
    const sequence = await createSequence(course.id, lesson.id, 'Cell cycle', [
      { id: 'sequence-item', value: 'Interphase' },
    ]);
    const assessment = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
    const plan = await createOrResumeRevisionPlan(
      assessment.id,
      15,
      {
        projectionMode: 'fsrs-6-practice-fallback',
        memoryModelVersion: 'fsrs-6',
        fallbackReason: 'missing',
      },
      now,
    );
    const original = await exportDatabase();
    const peer = {
      ...original,
      lessonCardExposures: original.lessonCardExposures!.map((row) => ({
        ...row,
        taughtAt: row.taughtAt + 1,
        updatedAt: row.updatedAt + 1,
      })),
      lessonCompletions: original.lessonCompletions!.map((row) => ({
        ...row,
        completedAt: row.completedAt + 1,
        updatedAt: row.updatedAt + 1,
      })),
      practiceMilestones: original.practiceMilestones!.map((row) => ({
        ...row,
        securedCardCount: 2,
        completedAt: now + 1,
        updatedAt: row.updatedAt + 1,
      })),
    };

    const merged = expectPeerProperties(original, peer);

    expect(merged.lessonCards).toEqual(original.lessonCards);
    expect(merged.lessonCardExposures).toEqual(peer.lessonCardExposures);
    expect(merged.lessonCompletions).toEqual(peer.lessonCompletions);
    expect(merged.practiceMilestones).toEqual(peer.practiceMilestones);
    expect(merged.sequences).toEqual([sequence]);
    expect(merged.revisionPlans).toEqual([plan]);
    const generated = original.cards.find((row) => row.sequenceItemId === 'sequence-item')!;
    expect(merged.cards.find((row) => row.id === generated.id)).toMatchObject({
      conceptId: generated.conceptId,
      sequenceItemId: 'sequence-item',
    });
    expect(merged.concepts).toEqual(original.concepts);
  });
});
