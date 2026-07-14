import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup } from './portability';
import {
  assignCardsToLesson,
  createCourse,
  createLesson,
  createLessonCard,
  createNote,
  createNoteAnnotation,
  deleteCards,
  deleteNote,
  getPracticeMilestone,
  linkCardToLesson,
  listLessonCardExposures,
  markLessonComplete,
  savePracticeMilestoneProgress,
  unlinkCardFromLesson,
  upsertLessonCardExposure,
} from './repository';

describe('Arc 4 persistence', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('keeps exposures unique per lesson and card without rewriting the first taught time', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');

    await upsertLessonCardExposure(lesson.id, card.id, 100);
    await upsertLessonCardExposure(lesson.id, card.id, 200);

    expect(await listLessonCardExposures(lesson.id)).toEqual([
      { lessonId: lesson.id, cardId: card.id, taughtAt: 100 },
    ]);
  });

  it('upgrades v11 reviewed cards into primary-lesson exposures only', async () => {
    await db.delete();
    const legacy = new Dexie('lacuna');
    legacy.version(11).stores({
      cards: 'id, deckId, courseId, primaryLessonId, type, lastReviewed, sequenceItemId',
      lessonCards: 'id, lessonId, cardId',
    });
    await legacy.open();
    await legacy.table('cards').bulkAdd([
      {
        id: 'reviewed',
        deckId: 'deck',
        courseId: 'course',
        primaryLessonId: 'primary',
        type: 'front_back',
        state: 2,
        lastReviewed: 200,
        createdAt: 100,
      },
      {
        id: 'new',
        deckId: 'deck',
        courseId: 'course',
        primaryLessonId: 'primary',
        type: 'front_back',
        state: 0,
        lastReviewed: null,
        createdAt: 100,
      },
    ]);
    await legacy.table('lessonCards').add({
      id: 'link',
      lessonId: 'linked',
      cardId: 'reviewed',
      createdAt: 100,
    });
    legacy.close();

    await db.open();

    expect(await db.lessonCardExposures.toArray()).toEqual([
      { lessonId: 'primary', cardId: 'reviewed', taughtAt: 200 },
    ]);
  });

  it('removes a linked lesson exposure when the link is removed', async () => {
    const course = await createCourse('Biology');
    const primary = await createLesson(course.id, 'Cells');
    const linked = await createLesson(course.id, 'Review');
    const card = await createLessonCard(course.id, primary.id, 'front_back', 'Q', 'A');
    await linkCardToLesson(linked.id, card.id);
    await upsertLessonCardExposure(linked.id, card.id, 100);

    await unlinkCardFromLesson(linked.id, card.id);

    expect(await db.lessonCards.where('lessonId').equals(linked.id).count()).toBe(0);
    expect(await listLessonCardExposures(linked.id)).toEqual([]);
  });

  it('removes links and exposures when their card is deleted', async () => {
    const course = await createCourse('Biology');
    const primary = await createLesson(course.id, 'Cells');
    const linked = await createLesson(course.id, 'Review');
    const card = await createLessonCard(course.id, primary.id, 'front_back', 'Q', 'A');
    await linkCardToLesson(linked.id, card.id);
    await upsertLessonCardExposure(primary.id, card.id, 100);
    await upsertLessonCardExposure(linked.id, card.id, 200);

    await deleteCards([card.id]);

    expect(await db.lessonCards.where('cardId').equals(card.id).count()).toBe(0);
    expect(await db.lessonCardExposures.where('cardId').equals(card.id).count()).toBe(0);
  });

  it('removes only the old primary-lesson exposure when a card is reassigned', async () => {
    const course = await createCourse('Biology');
    const first = await createLesson(course.id, 'Cells');
    const second = await createLesson(course.id, 'Respiration');
    const linked = await createLesson(course.id, 'Review');
    const card = await createLessonCard(course.id, first.id, 'front_back', 'Q', 'A');
    await linkCardToLesson(linked.id, card.id);
    await upsertLessonCardExposure(first.id, card.id, 100);
    await upsertLessonCardExposure(linked.id, card.id, 200);

    await assignCardsToLesson([card.id], course.id, second.id);

    expect(await listLessonCardExposures(first.id)).toEqual([]);
    expect(await listLessonCardExposures(second.id)).toEqual([]);
    expect(await listLessonCardExposures(linked.id)).toHaveLength(1);
  });

  it('invalidates practice progress when its effective scope version changes', async () => {
    await savePracticeMilestoneProgress('practice-auto-lesson-1-0', 'course-1', 'scope-a', 2, 5);
    expect(await getPracticeMilestone('practice-auto-lesson-1-0', 'scope-a')).toMatchObject({
      securedCardCount: 2,
      totalCardCount: 5,
    });
    expect(await getPracticeMilestone('practice-auto-lesson-1-0', 'scope-b')).toBeUndefined();

    await savePracticeMilestoneProgress(
      'practice-auto-lesson-1-0',
      'course-1',
      'scope-b',
      1,
      6,
      true,
      500,
    );
    expect(await getPracticeMilestone('practice-auto-lesson-1-0', 'scope-a')).toBeUndefined();
    expect(await getPracticeMilestone('practice-auto-lesson-1-0', 'scope-b')).toMatchObject({
      completedAt: 500,
      securedCardCount: 1,
      totalCardCount: 6,
    });
  });

  it('backs up learner progress but never serialises device-local annotations', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const note = await createNote(lesson.id, 'Introduction', 'Cell membrane');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    await upsertLessonCardExposure(lesson.id, card.id, 100);
    await markLessonComplete(lesson.id, 200);
    await savePracticeMilestoneProgress('practice-1', course.id, 'scope-a', 1, 1, true, 300);
    await createNoteAnnotation(note.id, 0, 4, 'Cell', 'Important');

    const backup = await exportDatabase();

    expect(backup.lessonCardExposures).toHaveLength(1);
    expect(backup.lessonCompletions).toHaveLength(1);
    expect(backup.practiceMilestones).toHaveLength(1);
    expect(backup).not.toHaveProperty('noteAnnotations');

    await importBackup(backup, 'replace');
    expect(await db.lessonCardExposures.count()).toBe(1);
    expect(await db.lessonCompletions.count()).toBe(1);
    expect(await db.practiceMilestones.count()).toBe(1);
    expect(await db.noteAnnotations.count()).toBe(0);
  });

  it('deletes annotations with their note', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const note = await createNote(lesson.id, 'Introduction', 'Cell membrane');
    await createNoteAnnotation(note.id, 0, 4, 'Cell');

    await deleteNote(note.id);

    expect(await db.noteAnnotations.where('noteId').equals(note.id).count()).toBe(0);
  });
});
