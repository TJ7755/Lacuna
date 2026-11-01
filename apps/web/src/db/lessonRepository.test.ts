import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createCourseCard,
  linkCardsToLesson,
  linkCardToLesson,
  reorderLessons,
  ratchetLessonUnlock,
} from './repository';
import { listLessons } from './read';
import { reset } from './courseRepository.testFixtures';

describe('createLesson orderIndex', () => {
  beforeEach(reset);

  it('first lesson gets orderIndex 0', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Week 1');
    expect(lesson.orderIndex).toBe(0);
  });

  it('subsequent lessons increment orderIndex', async () => {
    const course = await createCourse('History');
    const l1 = await createLesson(course.id, 'Week 1');
    const l2 = await createLesson(course.id, 'Week 2');
    const l3 = await createLesson(course.id, 'Week 3');
    expect(l1.orderIndex).toBe(0);
    expect(l2.orderIndex).toBe(1);
    expect(l3.orderIndex).toBe(2);
  });

  it('uses max existing orderIndex + 1 even after gaps', async () => {
    const course = await createCourse('History');
    await createLesson(course.id, 'A', { orderIndex: 10 });
    const next = await createLesson(course.id, 'B');
    expect(next.orderIndex).toBe(11);
  });

  it('gives concurrent lessons distinct indices and a stable listed order', async () => {
    const course = await createCourse('History');
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, index) => createLesson(course.id, `Week ${index + 1}`)),
    );
    const listed = await listLessons(course.id);

    expect(created.map((lesson) => lesson.orderIndex).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(listed.map((lesson) => lesson.orderIndex)).toEqual([0, 1, 2, 3, 4]);
    expect((await listLessons(course.id)).map((lesson) => lesson.id)).toEqual(
      listed.map((lesson) => lesson.id),
    );
  });

  it('defaults isExtension to false', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Week 1');
    expect(lesson.isExtension).toBe(false);
  });
});

describe('linkCardToLesson idempotency', () => {
  beforeEach(reset);

  it('returns the existing link without creating a duplicate on a second call', async () => {
    const course = await createCourse('Link test');
    const lesson = await createLesson(course.id, 'L1');
    const source = await createLesson(course.id, 'Source');
    const card = await createLessonCard(course.id, source.id, 'front_back', 'q', 'a');

    const first = await linkCardToLesson(lesson.id, card.id);
    const second = await linkCardToLesson(lesson.id, card.id);

    expect(first.id).toBe(second.id);
    expect(await db.lessonCards.where('lessonId').equals(lesson.id).count()).toBe(1);
  });

  it('creates distinct links for different cards in the same lesson', async () => {
    const course = await createCourse('Link test');
    const lesson = await createLesson(course.id, 'L1');
    const source = await createLesson(course.id, 'Source');
    const c1 = await createLessonCard(course.id, source.id, 'front_back', 'q1', 'a1');
    const c2 = await createLessonCard(course.id, source.id, 'front_back', 'q2', 'a2');

    await linkCardToLesson(lesson.id, c1.id);
    await linkCardToLesson(lesson.id, c2.id);

    const links = await db.lessonCards.where('lessonId').equals(lesson.id).toArray();
    expect(links).toHaveLength(2);
  });

  it('rejects a missing lesson or card', async () => {
    const course = await createCourse('Link test');
    const lesson = await createLesson(course.id, 'Target');
    const card = await createCourseCard(course.id, 'front_back', 'q', 'a');

    await expect(linkCardToLesson('missing', card.id)).rejects.toThrow('lesson could not be found');
    await expect(linkCardToLesson(lesson.id, 'missing')).rejects.toThrow('could not be found');
    expect(await db.lessonCards.count()).toBe(0);
  });

  it('rejects cross-course and redundant primary-lesson links', async () => {
    const courseA = await createCourse('Course A');
    const courseB = await createCourse('Course B');
    const target = await createLesson(courseA.id, 'Target');
    const primary = await createLesson(courseA.id, 'Primary');
    const crossCourseCard = await createCourseCard(courseB.id, 'front_back', 'q', 'a');
    const primaryCard = await createLessonCard(courseA.id, primary.id, 'front_back', 'q2', 'a2');

    await expect(linkCardToLesson(target.id, crossCourseCard.id)).rejects.toThrow('same course');
    await expect(linkCardToLesson(primary.id, primaryCard.id)).rejects.toThrow(
      'already belonging to this lesson',
    );
    expect(await db.lessonCards.count()).toBe(0);
  });

  it('rolls back the whole batch when any card is invalid', async () => {
    const course = await createCourse('Link test');
    const target = await createLesson(course.id, 'Target');
    const source = await createLesson(course.id, 'Source');
    const valid = await createLessonCard(course.id, source.id, 'front_back', 'q', 'a');

    await expect(linkCardsToLesson(target.id, [valid.id, 'missing'])).rejects.toThrow(
      'could not be found',
    );
    expect(await db.lessonCards.count()).toBe(0);
  });

  it('serialises concurrent duplicate requests through the lessonCards write transaction', async () => {
    const course = await createCourse('Link test');
    const target = await createLesson(course.id, 'Target');
    const source = await createLesson(course.id, 'Source');
    const card = await createLessonCard(course.id, source.id, 'front_back', 'q', 'a');

    const [first, second] = await Promise.all([
      linkCardToLesson(target.id, card.id),
      linkCardToLesson(target.id, card.id),
    ]);

    expect(first.id).toBe(second.id);
    expect(await db.lessonCards.count()).toBe(1);
  });
});

describe('reorderLessons', () => {
  beforeEach(reset);

  it('reassigns orderIndex by array position', async () => {
    const course = await createCourse('Reorder test');
    const l1 = await createLesson(course.id, 'L1'); // orderIndex 0
    const l2 = await createLesson(course.id, 'L2'); // orderIndex 1
    const l3 = await createLesson(course.id, 'L3'); // orderIndex 2

    // Reverse the order.
    await reorderLessons(course.id, [l3.id, l2.id, l1.id]);

    const updated = await db.lessons.where('courseId').equals(course.id).sortBy('orderIndex');
    expect(updated[0].id).toBe(l3.id);
    expect(updated[0].orderIndex).toBe(0);
    expect(updated[1].id).toBe(l2.id);
    expect(updated[1].orderIndex).toBe(1);
    expect(updated[2].id).toBe(l1.id);
    expect(updated[2].orderIndex).toBe(2);
  });
});

describe('ratchetLessonUnlock', () => {
  beforeEach(async () => {
    await Promise.all([db.courses.clear(), db.lessons.clear()]);
  });

  it('sets unlockedAt the first time it is called', async () => {
    const course = await createCourse('Test course');
    const lesson = await createLesson(course.id, 'Lesson 1');
    expect((await db.lessons.get(lesson.id))?.unlockedAt).toBeUndefined();

    const now = Date.now();
    await ratchetLessonUnlock(lesson.id, now);

    expect((await db.lessons.get(lesson.id))?.unlockedAt).toBe(now);
  });

  it('never re-sets or clears an already-ratcheted lesson (one-way)', async () => {
    const course = await createCourse('Test course');
    const lesson = await createLesson(course.id, 'Lesson 1');

    const first = Date.now();
    await ratchetLessonUnlock(lesson.id, first);
    await ratchetLessonUnlock(lesson.id, first + 10_000);

    expect((await db.lessons.get(lesson.id))?.unlockedAt).toBe(first);
  });

  it('no-ops for a non-existent lesson', async () => {
    await expect(ratchetLessonUnlock('missing-lesson-id')).resolves.toBeUndefined();
  });
});
