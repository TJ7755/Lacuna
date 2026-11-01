import 'fake-indexeddb/auto';
import { expect } from 'vitest';
import { db } from './schema';
import type { CourseSnapshot } from './repository';
import type { OcclusionRegion, RevisionProjection } from '@lacuna/core/db/types';

export const revisionFallback: RevisionProjection = {
  projectionMode: 'fsrs-6-practice-fallback',
  memoryModelVersion: 'fsrs-6',
  fallbackReason: 'missing',
};

export function labelRegion(id: string): OcclusionRegion {
  return { id, role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.1, h: 0.1 };
}

export function waitForStamp(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 2));
}

export async function expectStampAdvanced(
  read: () => Promise<number | undefined>,
  mutate: () => Promise<unknown>,
): Promise<void> {
  const before = await read();
  expect(before).toBeGreaterThan(0);
  await waitForStamp();
  await mutate();
  expect(await read()).toBeGreaterThan(before!);
}

export function tombstoneKey(table: string, recordId: string): string {
  return `${table}\0${recordId}`;
}

export function expectedCourseTombstoneKeys(snapshot: CourseSnapshot): Set<string> {
  const keys = new Set<string>();
  const add = (table: string, recordId: string) => keys.add(tombstoneKey(table, recordId));
  add('courses', snapshot.course.id);
  for (const lesson of snapshot.lessons) add('lessons', lesson.id);
  for (const note of snapshot.notes) add('notes', note.id);
  for (const link of snapshot.lessonCards) add('lessonCards', link.id);
  for (const exposure of snapshot.lessonCardExposures) {
    add('lessonCardExposures', `${exposure.lessonId}:${exposure.cardId}`);
  }
  for (const completion of snapshot.lessonCompletions)
    add('lessonCompletions', completion.lessonId);
  for (const node of snapshot.practiceNodes) add('practiceNodes', node.id);
  for (const milestone of snapshot.practiceMilestones) add('practiceMilestones', milestone.nodeKey);
  for (const assessment of snapshot.courseAssessments) add('courseAssessments', assessment.id);
  for (const plan of snapshot.revisionPlans) add('revisionPlans', plan.id);
  for (const sequence of snapshot.sequences) add('sequences', sequence.id);
  for (const occlusion of snapshot.occlusions) add('occlusions', occlusion.id);
  for (const card of snapshot.cards) add('cards', card.id);
  for (const concept of snapshot.concepts) add('concepts', concept.id);
  for (const question of snapshot.questions) add('questions', question.id);
  for (const set of snapshot.questionConcepts) add('questionConcepts', set.questionId);
  for (const attempt of snapshot.questionAttempts) add('questionAttempts', attempt.id);
  for (const mapping of snapshot.lineageIdMappings) add('lineageIdMappings', mapping.id);
  for (const review of snapshot.pendingMergeReviews) add('pendingMergeReviews', review.id);
  for (const unit of snapshot.schedulingUnits) add('schedulingUnits', unit.id);
  for (const row of snapshot.coursePerformance) add('coursePerformance', row.courseId);
  for (const row of snapshot.schedulingPerformance)
    add('schedulingPerformance', row.schedulingUnitId);
  return keys;
}

export async function actualTombstoneKeys(): Promise<Set<string>> {
  return new Set(
    (await db.tombstones.toArray()).map((row) => tombstoneKey(row.table, row.recordId)),
  );
}

export async function reset() {
  db.close();
  await db.delete();
  await db.open();
}
