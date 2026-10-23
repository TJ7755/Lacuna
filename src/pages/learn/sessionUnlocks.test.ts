import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createPracticeNode,
  upsertLessonCardExposure,
} from '../../db/repository';
import { ratchetSessionUnlocks } from './sessionUnlocks';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function taughtLesson(courseId: string, name: string) {
  const lesson = await createLesson(courseId, name);
  const card = await createLessonCard(courseId, lesson.id, 'front_back', name, 'Answer');
  await upsertLessonCardExposure(lesson.id, card.id);
  return { lesson, card };
}

describe('session completion unlocks', () => {
  it('only ratchets the scoped successor and preserves an existing unlock timestamp', async () => {
    const course = await createCourse('Science', { unlockMode: 'semi-linear', autoPractice: false });
    const first = await taughtLesson(course.id, 'First');
    const second = await taughtLesson(course.id, 'Second');
    const third = await createLesson(course.id, 'Third');

    await ratchetSessionUnlocks(true, course.id, () => second.lesson.id);
    expect((await db.lessons.get(second.lesson.id))?.unlockedAt).toBeUndefined();
    const unlockedAt = (await db.lessons.get(third.id))?.unlockedAt;
    expect(unlockedAt).toEqual(expect.any(Number));

    await ratchetSessionUnlocks(true, course.id, () => first.lesson.id);
    expect((await db.lessons.get(second.lesson.id))?.unlockedAt).toEqual(expect.any(Number));
    await ratchetSessionUnlocks(true, course.id, () => null);
    expect((await db.lessons.get(third.id))?.unlockedAt).toBe(unlockedAt);
    expect(await db.reviewHistory.count()).toBe(0);
  });

  it('keeps a manual checkpoint gating the just-taught lesson', async () => {
    const course = await createCourse('Science', { unlockMode: 'semi-linear', autoPractice: false });
    const first = await taughtLesson(course.id, 'First');
    const second = await createLesson(course.id, 'Second');
    await createPracticeNode(course.id, { type: 'manual', name: 'Checkpoint', position: 0 });

    await ratchetSessionUnlocks(true, course.id, () => first.lesson.id);
    expect((await db.lessons.get(second.id))?.unlockedAt).toBeUndefined();
  });

  it.each([false, true])('requires scheduled knowledge when introductions are disabled (scheduled %s)', async (scheduled) => {
    const course = await createCourse('Science', {
      unlockMode: 'semi-linear', autoPractice: false, learnFirst: false,
    });
    const first = await taughtLesson(course.id, 'First');
    const second = await createLesson(course.id, 'Second');
    if (scheduled) await db.cards.update(first.card.id, { state: 2 });

    await ratchetSessionUnlocks(true, course.id, () => null);
    expect((await db.lessons.get(second.id))?.unlockedAt !== undefined).toBe(scheduled);
  });

  it('uses explicit completion for cardless lessons and skips extension lessons', async () => {
    const course = await createCourse('Science', {
      unlockMode: 'semi-linear', autoPractice: false, learnFirst: false,
    });
    const first = await createLesson(course.id, 'Cardless');
    const extension = await createLesson(course.id, 'Extension');
    await db.lessons.update(extension.id, { isExtension: true });
    const next = await createLesson(course.id, 'Next');
    await ratchetSessionUnlocks(true, course.id, () => null);
    expect((await db.lessons.get(next.id))?.unlockedAt).toBeUndefined();
    await db.lessonCompletions.put({ lessonId: first.id, completedAt: Date.now(), updatedAt: Date.now() });
    await ratchetSessionUnlocks(true, course.id, () => null);
    expect((await db.lessons.get(next.id))?.unlockedAt).toEqual(expect.any(Number));
    expect((await db.lessons.get(extension.id))?.unlockedAt).toBeUndefined();
  });

  it('does nothing without a reached goal, course or semi-linear unlock mode', async () => {
    const course = await createCourse('Science', { unlockMode: 'open' });
    const readLesson = vi.fn(() => null);
    await ratchetSessionUnlocks(false, course.id, readLesson);
    await ratchetSessionUnlocks(true, null, readLesson);
    await ratchetSessionUnlocks(true, 'missing', readLesson);
    await ratchetSessionUnlocks(true, course.id, readLesson);
    expect(readLesson).not.toHaveBeenCalled();
  });

  it('handles a course without core lessons', async () => {
    const course = await createCourse('Empty', { unlockMode: 'semi-linear' });
    await ratchetSessionUnlocks(true, course.id, () => null);
    expect(await db.lessons.count()).toBe(0);
  });

  it('participates in the caller transaction rather than committing unlocks separately', async () => {
    const course = await createCourse('Science', { unlockMode: 'semi-linear', autoPractice: false });
    await taughtLesson(course.id, 'First');
    const second = await createLesson(course.id, 'Second');
    await expect(db.transaction('rw', db.tables, async () => {
      await ratchetSessionUnlocks(true, course.id, () => null);
      expect((await db.lessons.get(second.id))?.unlockedAt).toEqual(expect.any(Number));
      throw new Error('Completion failed');
    })).rejects.toThrow('Completion failed');
    expect((await db.lessons.get(second.id))?.unlockedAt).toBeUndefined();
  });
});
