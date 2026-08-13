import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCard,
  createCourse,
  createLesson,
  createNote,
  deleteCards,
  deleteCourse,
  deleteLesson,
  restoreCourse,
  snapshotCourse,
  stampMissingLessonViewModes,
  updateCourse,
  updateNote,
} from './repository';
import { createOcclusion } from './occlusionRepository';

async function reset() {
  db.close();
  await db.delete();
  await db.open();
}

describe('repository mutation stamps and tombstones', () => {
  beforeEach(reset);

  it('advances updatedAt on course and note writes', async () => {
    const course = await createCourse('Biology');
    expect(course.updatedAt).toBeGreaterThan(0);
    const before = course.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await updateCourse(course.id, { description: 'Cells' });
    const updated = await db.courses.get(course.id);
    expect(updated?.updatedAt).toBeGreaterThan(before);

    const lesson = await createLesson(course.id, 'Intro');
    const note = await createNote(lesson.id, 'Notes', 'Body');
    const noteBefore = note.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await updateNote(note.id, { content: 'Edited' });
    expect((await db.notes.get(note.id))?.updatedAt).toBeGreaterThan(noteBefore);
  });

  it('does not stamp stampMissingLessonViewModes', async () => {
    const course = await createCourse('Biology');
    await db.courses.update(course.id, { lessonViewMode: undefined, updatedAt: 42 });
    await stampMissingLessonViewModes();
    expect(await db.courses.get(course.id)).toMatchObject({ updatedAt: 42 });
  });

  it('tombstones a deleted card in the same transaction', async () => {
    const course = await createCourse('Biology');
    const card = await createCard(course.id, 'front_back', 'Q', 'A');
    await deleteCards([card.id]);
    expect(await db.cards.get(card.id)).toBeUndefined();
    expect(await db.tombstones.get(['cards', card.id])).toMatchObject({
      table: 'cards',
      recordId: card.id,
    });
  });

  it('tombstones every snapshot-carried row when deleting a course, including occlusions', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Intro');
    await createNote(lesson.id, 'Notes', 'Body');
    await createCard(course.id, 'front_back', 'Q', 'A');
    const occlusion = await createOcclusion(course.id, null, 'Diagram', 'hash', []);

    const snapshot = await snapshotCourse(course.id);
    expect(snapshot?.occlusions).toHaveLength(1);

    await deleteCourse(course.id);

    const tombstones = await db.tombstones.toArray();
    const tables = new Set(tombstones.map((row) => row.table));
    expect(tables.has('courses')).toBe(true);
    expect(tables.has('lessons')).toBe(true);
    expect(tables.has('notes')).toBe(true);
    expect(tables.has('cards')).toBe(true);
    expect(tables.has('occlusions')).toBe(true);
    expect(tables.has('schedulingUnits')).toBe(true);
    expect(tombstones.some((row) => row.table === 'noteAnnotations')).toBe(false);
    expect(await db.occlusions.get(occlusion.id)).toBeUndefined();

    await restoreCourse(snapshot!);
    expect(await db.courses.get(course.id)).toMatchObject({
      name: 'Biology',
      updatedAt: snapshot!.course.updatedAt,
    });
    expect(await db.occlusions.get(occlusion.id)).toMatchObject({ id: occlusion.id });
    expect(await db.tombstones.count()).toBe(0);
  });

  it('does not tombstone cards when a lesson is deleted', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Intro');
    const card = await createCard(course.id, 'front_back', 'Q', 'A');
    await db.cards.update(card.id, { primaryLessonId: lesson.id });

    await deleteLesson(lesson.id);

    expect(await db.cards.get(card.id)).toMatchObject({ id: card.id, primaryLessonId: null });
    expect(await db.tombstones.get(['cards', card.id])).toBeUndefined();
    expect(await db.tombstones.get(['lessons', lesson.id])).toMatchObject({ table: 'lessons' });
  });
});
