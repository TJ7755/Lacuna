import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImageBlob } from '../utils/compressImage';
import { createCard, createCourse, createLesson, createNote } from './repository';
import { db } from './schema';
import { exportDatabase, importBackup } from './portability';

vi.mock('../utils/compressImage', () => ({
  compressImageBlob: vi.fn(),
}));

describe('backup media preparation', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.mocked(compressImageBlob).mockReset();
  });

  it.each(['replace', 'merge'] as const)(
    'finishes asynchronous Card and Note image conversion before the %s write transaction',
    async (mode) => {
      const course = await createCourse('Illustrated course');
      const lesson = await createLesson(course.id, 'Illustrated lesson');
      const card = await createCard(course.id, 'front_back', 'Question', 'Answer');
      const note = await createNote(lesson.id, 'Note', 'Local text');
      const backup = await exportDatabase();
      const inline = (text: string) => `![scan](data:image/png;base64,${btoa(text)})`;
      backup.cards = [
        { ...card, createdAt: card.createdAt + 1, front: inline('front'), back: inline('back') },
      ];
      backup.notes = [{ ...note, content: inline('note'), createdAt: note.createdAt + 1 }];
      vi.mocked(compressImageBlob).mockImplementation(async (blob) => {
        expect(Dexie.currentTransaction).toBeFalsy();
        await new Promise((resolve) => setTimeout(resolve, 1));
        return { blob, width: 12, height: 8 };
      });

      await importBackup(backup, mode);

      expect(compressImageBlob).toHaveBeenCalledTimes(3);
      const restoredCard = (await db.cards.get(card.id))!;
      const restoredNote = (await db.notes.get(note.id))!;
      for (const markdown of [restoredCard.front, restoredCard.back, restoredNote.content]) {
        expect(markdown).toMatch(/^!\[scan\]\(lacuna-asset:\/\/[a-f0-9]{64}\)$/);
        const hash = markdown.match(/[a-f0-9]{64}/)![0];
        expect(await db.assets.get(hash)).toMatchObject({ width: 12, height: 8 });
      }
      expect(await db.assets.count()).toBe(3);
    },
  );
});
