// CRUD for lesson notes and their device-local annotations.
//
// Notes are course content and are tombstoned on delete. Note annotations are
// device-local: they are absent from BackupFile and are deliberately not
// tombstoned, though they do carry updatedAt.

import { db, makeId } from './schema';
import type { Note, NoteAnnotation } from './types';
import { scheduleAssetGc } from './assets';
import { friendlyDbError } from './dbErrors';
import { stampUpdatedAt, recordTombstone } from './mutationStamp';

export async function createNote(
  lessonId: string,
  name: string,
  content?: string,
  opts?: Partial<Note>,
): Promise<Note> {
  try {
    const existing = await db.notes.where('lessonId').equals(lessonId).toArray();
    const maxIndex = existing.reduce((m, n) => Math.max(m, n.orderIndex), -1);
    const createdAt = Date.now();
    const note = stampUpdatedAt(
      {
        id: makeId(),
        lessonId,
        name: name.trim() || 'Untitled note',
        content: content ?? '',
        orderIndex: maxIndex + 1,
        createdAt,
        ...opts,
      },
      createdAt,
    );
    await db.notes.add(note);
    return note;
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function updateNote(id: string, changes: Partial<Note>): Promise<void> {
  try {
    await db.notes.update(id, stampUpdatedAt(changes));
    if ('content' in changes) scheduleAssetGc();
  } catch (err) {
    throw friendlyDbError(err);
  }
}

export async function deleteNote(id: string): Promise<void> {
  await db.transaction('rw', db.notes, db.noteAnnotations, db.tombstones, async (tx) => {
    await db.noteAnnotations.where('noteId').equals(id).delete();
    await db.notes.delete(id);
    await recordTombstone(tx, 'notes', id);
  });
  scheduleAssetGc();
}

/** All notes for a lesson, ordered by orderIndex ascending. */
export async function listNotes(lessonId: string): Promise<Note[]> {
  return db.notes.where('lessonId').equals(lessonId).sortBy('orderIndex');
}

/** Assign a fresh orderIndex to each note based on its position in orderedNoteIds. */
export async function reorderNotes(_lessonId: string, orderedNoteIds: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.notes, async () => {
    await db.notes.bulkUpdate(
      orderedNoteIds.map((id, orderIndex) => ({
        key: id,
        changes: stampUpdatedAt({ orderIndex }, now),
      })),
    );
  });
}

export async function createNoteAnnotation(
  noteId: string,
  startOffset: number,
  endOffset: number,
  selectedText: string,
  body?: string,
): Promise<NoteAnnotation> {
  if (startOffset < 0 || endOffset <= startOffset) {
    throw new Error('Annotation offsets must describe a non-empty source range.');
  }
  const now = Date.now();
  const annotation = stampUpdatedAt(
    {
      id: makeId(),
      noteId,
      startOffset,
      endOffset,
      selectedText,
      ...(body?.trim() ? { body: body.trim() } : {}),
      createdAt: now,
    },
    now,
  );
  await db.noteAnnotations.add(annotation);
  return annotation;
}

export async function updateNoteAnnotation(
  id: string,
  changes: Pick<Partial<NoteAnnotation>, 'body' | 'startOffset' | 'endOffset' | 'selectedText'>,
): Promise<void> {
  await db.noteAnnotations.update(id, stampUpdatedAt(changes));
}

export async function deleteNoteAnnotation(id: string): Promise<void> {
  await db.noteAnnotations.delete(id);
}

export async function listNoteAnnotations(noteId: string): Promise<NoteAnnotation[]> {
  return db.noteAnnotations.where('noteId').equals(noteId).sortBy('startOffset');
}
