import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse, updateCourse } from './courseRepository';
import { createLesson } from './lessonRepository';
import { createLessonCard, createLessonBasicReversedPair } from './cardRepository';
import { setAuthoredAnswerMode } from './answerModeRepository';
import { exportDatabase, importBackup } from './portability';
import { exportCardsJson } from './export';
import { parseJsonImport } from './importEngine';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function seed() {
  const course = await createCourse('French', { schedulingMode: 'steady' });
  const lesson = await createLesson(course.id, 'Animals');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
  return { course, lesson, card };
}

describe('authored answer modes', () => {
  it('sets a lesson default without overwriting card overrides or review data', async () => {
    const { course, lesson, card } = await seed();
    await setAuthoredAnswerMode(course.id, { cardIds: [card.id] }, 'reveal');
    await setAuthoredAnswerMode(course.id, { lessonId: lesson.id }, 'type');
    expect((await db.lessons.get(lesson.id))?.answerMode).toBe('type');
    expect(await db.cards.get(card.id)).toMatchObject({
      answerMode: 'reveal',
      reps: 0,
      stability: null,
    });
    await setAuthoredAnswerMode(course.id, { cardIds: [card.id] }, undefined);
    expect((await db.cards.get(card.id))?.answerMode).toBeUndefined();
    const later = await createLessonCard(course.id, lesson.id, 'cloze', '{{c1::chien}}', '');
    expect(later.answerMode).toBeUndefined();
  });

  it.each(['study', 'locked', 'archived'] as const)(
    'rejects changes in %s courses',
    async (state) => {
      const { course, lesson, card } = await seed();
      if (state === 'study') await updateCourse(course.id, { lessonViewMode: 'study' });
      if (state === 'archived') await updateCourse(course.id, { archived: true });
      if (state === 'locked')
        await db.courses.update(course.id, { 'distributedCopy.locked': true });
      await expect(
        setAuthoredAnswerMode(course.id, { lessonId: lesson.id }, 'type'),
      ).rejects.toThrow('Author mode');
      await expect(
        setAuthoredAnswerMode(course.id, { cardIds: [card.id] }, 'type'),
      ).rejects.toThrow('Author mode');
      expect((await db.cards.get(card.id))?.answerMode).toBeUndefined();
    },
  );

  it('rejects cross-course mutations and machine-marked cards atomically', async () => {
    const { course, card } = await seed();
    const other = await seed();
    await expect(
      setAuthoredAnswerMode(course.id, { lessonId: other.lesson.id }, 'type'),
    ).rejects.toThrow('Lesson not found');
    await expect(
      setAuthoredAnswerMode(course.id, { cardIds: [card.id, other.card.id] }, 'type'),
    ).rejects.toThrow('ordinary text');
    expect((await db.cards.get(card.id))?.answerMode).toBeUndefined();
  });

  it('preserves authored choices through backup replacement and JSON card export', async () => {
    const { course, lesson, card } = await seed();
    await setAuthoredAnswerMode(course.id, { lessonId: lesson.id }, 'type');
    const pair = await createLessonBasicReversedPair(
      course.id,
      lesson.id,
      'Dog',
      'chien',
      [],
      'reveal',
    );
    const backup = await exportDatabase();
    await importBackup(backup, 'replace');
    expect((await db.lessons.get(lesson.id))?.answerMode).toBe('type');
    expect((await db.cards.get(card.id))?.answerMode).toBeUndefined();
    expect((await db.cards.get(pair.card.id))?.answerMode).toBe('reveal');
    expect((await db.cards.get(pair.reverse.id))?.answerMode).toBe('reveal');
    const exported = parseJsonImport(await exportCardsJson()).cards;
    expect(exported.find((row) => row.front === 'Cat')?.answerMode).toBe('type');
    expect(exported.find((row) => row.front === 'Dog')?.answerMode).toBe('reveal');
  });
});
