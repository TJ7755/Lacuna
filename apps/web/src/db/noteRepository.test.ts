import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  createNote,
  createNoteAnnotation,
  deleteNoteAnnotation,
  listNoteAnnotations,
  listNotes,
  reorderNotes,
  updateNote,
  updateNoteAnnotation,
} from './noteRepository';
import { createCourse, createLesson } from './repository';
import { reset as resetCourseRepositoryData } from './courseRepository.testFixtures';

async function reset() {
  db.close();
  await db.delete();
  await db.open();
}

describe('noteRepository', () => {
  beforeEach(reset);
  afterEach(() => vi.restoreAllMocks());

  it('names blank notes and appends them after existing ones', async () => {
    const first = await createNote('lesson-1', '   ');
    const second = await createNote('lesson-1', ' Second ', 'Body');
    expect(first).toMatchObject({ name: 'Untitled note', content: '', orderIndex: 0 });
    expect(second).toMatchObject({ name: 'Second', content: 'Body', orderIndex: 1 });
  });

  it('reports a full browser store in plain words', async () => {
    vi.spyOn(db.notes, 'add').mockRejectedValueOnce(
      new DOMException('quota', 'QuotaExceededError'),
    );
    await expect(createNote('lesson-1', 'Note')).rejects.toThrow('Your browser storage is full');
  });

  it('updates notes and wraps update failures', async () => {
    const note = await createNote('lesson-1', 'Note');
    await updateNote(note.id, { name: 'Renamed' });
    await updateNote(note.id, { content: 'New body' });
    expect(await db.notes.get(note.id)).toMatchObject({ name: 'Renamed', content: 'New body' });

    vi.spyOn(db.notes, 'update').mockRejectedValueOnce('offline');
    await expect(updateNote(note.id, { name: 'x' })).rejects.toThrow('offline');
  });

  it('lists and reorders notes by position', async () => {
    const a = await createNote('lesson-1', 'A');
    const b = await createNote('lesson-1', 'B');
    await createNote('lesson-2', 'Other');
    await reorderNotes('lesson-1', [b.id, a.id]);
    expect((await listNotes('lesson-1')).map((n) => n.name)).toEqual(['B', 'A']);
  });

  it('creates, edits, orders and deletes annotations', async () => {
    const late = await createNoteAnnotation('note-1', 10, 14, 'word', '  ');
    const early = await createNoteAnnotation('note-1', 0, 4, 'Some', ' Remark ');
    expect(late).not.toHaveProperty('body');
    expect(early.body).toBe('Remark');

    await updateNoteAnnotation(late.id, { body: 'Edited' });
    expect((await listNoteAnnotations('note-1')).map((a) => a.body)).toEqual(['Remark', 'Edited']);

    await deleteNoteAnnotation(early.id);
    expect((await listNoteAnnotations('note-1')).map((a) => a.id)).toEqual([late.id]);
  });

  it('rejects empty or negative annotation ranges', async () => {
    await expect(createNoteAnnotation('note-1', -1, 2, 'x')).rejects.toThrow('non-empty');
    await expect(createNoteAnnotation('note-1', 3, 3, 'x')).rejects.toThrow('non-empty');
  });
});

describe('listNotes ordering', () => {
  beforeEach(resetCourseRepositoryData);

  it('returns notes in orderIndex ascending order', async () => {
    const course = await createCourse('Notes test');
    const lesson = await createLesson(course.id, 'L1');
    const n1 = await createNote(lesson.id, 'Note 1');
    const n2 = await createNote(lesson.id, 'Note 2');
    const n3 = await createNote(lesson.id, 'Note 3');

    const notes = await listNotes(lesson.id);
    expect(notes.map((n) => n.id)).toEqual([n1.id, n2.id, n3.id]);
  });

  it('gives concurrent notes distinct indices and a stable listed order', async () => {
    const course = await createCourse('Notes test');
    const lesson = await createLesson(course.id, 'L1');
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, index) => createNote(lesson.id, `Note ${index + 1}`)),
    );
    const listed = await listNotes(lesson.id);

    expect(created.map((note) => note.orderIndex).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(listed.map((note) => note.orderIndex)).toEqual([0, 1, 2, 3, 4]);
    expect((await listNotes(lesson.id)).map((note) => note.id)).toEqual(
      listed.map((note) => note.id),
    );
  });
});
