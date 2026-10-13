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
