import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from './schema';
import { createCourse, deleteCourse } from './courseRepository';
import {
  createLesson,
  deleteLesson,
  linkCardToLesson,
  upsertLessonCardExposure,
} from './lessonRepository';
import {
  createCourseCard,
  createLessonCard,
  deleteCards,
  restoreCards,
  snapshotCards,
} from './cardRepository';
import {
  createSequence,
  deleteSequence,
  restoreSequence,
  snapshotSequence,
} from './sequenceRepository';
import {
  createOcclusion,
  deleteOcclusion,
  restoreOcclusion,
  snapshotOcclusion,
} from './occlusionRepository';
import { exportDatabase } from './backupSnapshot';
import { mergeSnapshots } from '../sync/mergeSnapshots';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => vi.useRealTimers());

async function undoableContent(
  kind: 'card' | 'sequence' | 'occlusion',
  courseId: string,
  lessonId: string | null = null,
) {
  async function expose() {
    if (!lessonId) return;
    const [card] = await db.cards.where('courseId').equals(courseId).toArray();
    const linkedLesson = await createLesson(courseId, 'Linked lesson');
    await linkCardToLesson(linkedLesson.id, card.id);
    await upsertLessonCardExposure(lessonId, card.id);
  }
  if (kind === 'card') {
    const card = lessonId
      ? await createLessonCard(courseId, lessonId, 'front_back', 'Question', 'Answer')
      : await createCourseCard(courseId, 'front_back', 'Question', 'Answer');
    await expose();
    const snapshot = await snapshotCards([card.id]);
    return { remove: () => deleteCards([card.id]), restore: () => restoreCards(snapshot) };
  }
  if (kind === 'sequence') {
    const record = await createSequence(courseId, lessonId, 'Sequence', [
      { id: 'item', value: 'Content' },
    ]);
    await expose();
    const snapshot = (await snapshotSequence(record.id))!;
    return { remove: () => deleteSequence(record.id), restore: () => restoreSequence(snapshot) };
  }
  const record = await createOcclusion(courseId, lessonId, 'Diagram', 'hash', [
    { id: 'region', role: 'label', shape: 'rectangle', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
  ]);
  await expose();
  const snapshot = (await snapshotOcclusion(record.id))!;
  return { remove: () => deleteOcclusion(record.id), restore: () => restoreOcclusion(snapshot) };
}

it.each(['card', 'sequence', 'occlusion'] as const)(
  'keeps an undone %s deletion after peer merge despite a clock rollback',
  async (kind) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    const course = await createCourse('Undo');
    const lesson = await createLesson(course.id, 'Lesson');
    const content = await undoableContent(kind, course.id, lesson.id);
    const before = await exportDatabase();
    vi.setSystemTime(new Date('2026-11-15T12:00:01Z'));
    await content.remove();
    const remote = await exportDatabase();
    vi.setSystemTime(new Date('2026-11-15T11:59:00Z'));
    await content.restore();
    const local = await exportDatabase();
    const merged = mergeSnapshots(local, remote);
    expect(before.lessonCards).toHaveLength(1);
    expect(merged.lessonCards.map((link) => link.id)).toEqual(
      before.lessonCards!.map((link) => link.id),
    );
    expect(merged.lessonCardExposures).toEqual(expect.arrayContaining(local.lessonCardExposures!));
    expect(merged.lessonCardExposures).toHaveLength(local.lessonCardExposures!.length);
    expect(merged.cards.map((card) => card.id)).toEqual(before.cards.map((card) => card.id));
    expect(merged.sequences.map((sequence) => sequence.id)).toEqual(
      (before.sequences ?? []).map((sequence) => sequence.id),
    );
    expect(merged.occlusions.map((occlusion) => occlusion.id)).toEqual(
      (before.occlusions ?? []).map((occlusion) => occlusion.id),
    );
  },
);

it.each(['sequence', 'occlusion'] as const)(
  'rejects %s Undo after its course is deleted without restoring orphan rows',
  async (kind) => {
    const course = await createCourse('Undo');
    const content = await undoableContent(kind, course.id);
    await content.remove();
    await deleteCourse(course.id);
    await expect(content.restore()).rejects.toThrow(/course no longer exists/i);
    expect(await db.sequences.count()).toBe(0);
    expect(await db.occlusions.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.concepts.count()).toBe(0);
  },
);

it.each(['sequence', 'occlusion'] as const)(
  'rejects %s Undo after its lesson is deleted',
  async (kind) => {
    const course = await createCourse('Undo');
    const lesson = await createLesson(course.id, 'Lesson');
    const content = await undoableContent(kind, course.id, lesson.id);
    await content.remove();
    await deleteLesson(lesson.id);
    await expect(content.restore()).rejects.toThrow(/lesson no longer exists/i);
    expect(await db.cards.count()).toBe(0);
  },
);
