import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  ensureCourseBankBackingDeck,
  ensureLessonBackingDeck,
} from './backingDecks';
import { createCourse, createLesson } from './repository';

async function reset(): Promise<void> {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.userPerformance.clear(),
    db.courseAssessments.clear(),
  ]);
}

describe('backing deck adapter', () => {
  beforeEach(reset);

  it('owns one scheduling deck for a lesson', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');

    const first = await ensureLessonBackingDeck(course.id, lesson.id);
    const second = await ensureLessonBackingDeck(course.id, lesson.id);

    expect(second).toBe(first);
    expect(await db.decks.get(first)).toMatchObject({
      backingCourseId: course.id,
      backingLessonId: lesson.id,
      name: 'Cells',
    });
  });

  it('owns one scheduling deck for unassigned course cards', async () => {
    const course = await createCourse('Biology');

    const first = await ensureCourseBankBackingDeck(course.id);
    const second = await ensureCourseBankBackingDeck(course.id);

    expect(second).toBe(first);
    expect(await db.decks.get(first)).toMatchObject({
      backingCourseId: course.id,
      backingLessonId: null,
      name: 'Biology — Question bank',
    });
  });
});
