import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  exportDatabase,
  downloadBackup,
  importBackup,
  readBackupFile,
  MAX_BACKUP_FILE_BYTES,
  validateBackup,
  BACKUP_VERSION,
  PRE_V22_BACKUP_MESSAGE,
} from './portability';
import type { BackupFile } from '@lacuna/core/db/types';
import {
  createCourse,
  createCard,
  createLesson,
  createNote,
  createNoteAnnotation,
  markLessonComplete,
  savePracticeMilestoneProgress,
  upsertLessonCardExposure,
} from './repository';

import { reset, preV22Backup } from './portability.testFixtures';

describe('backup export, replacement and file boundary', () => {
  beforeEach(reset);

  it('exports a valid BackupFile with the current version', async () => {
    const deck = await createCourse('Biology');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');

    const backup = await exportDatabase();

    expect(backup.app).toBe('lacuna-v15');
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(validateBackup(backup)).toBe(true);
    expect(backup.decks).toBeUndefined();
    expect(backup.courses).toHaveLength(1);
    expect(backup.courses?.[0].name).toBe('Biology');
    expect(backup.cards).toHaveLength(1);
    expect(backup.cards[0].front).toBe('Q1');
    expect(backup.reviewHistory).toEqual([]);
  });

  it('refuses a backup that still carries Deck rows', async () => {
    const backup = preV22Backup({ decks: [{ id: 'old-deck' }] as BackupFile['decks'] });
    await expect(importBackup(backup, 'replace')).rejects.toThrow(PRE_V22_BACKUP_MESSAGE);
    await expect(readBackupFile(new File([JSON.stringify(backup)], 'old.json'))).rejects.toThrow(
      PRE_V22_BACKUP_MESSAGE,
    );
  });

  it('refuses a backup that still carries Folder rows', async () => {
    const backup = preV22Backup({
      folders: [{ id: 'old-folder', name: 'Chemistry', parentId: null, createdAt: 1 }],
    });
    await expect(importBackup(backup, 'merge')).rejects.toThrow(PRE_V22_BACKUP_MESSAGE);
    await expect(readBackupFile(new File([JSON.stringify(backup)], 'old.json'))).rejects.toThrow(
      PRE_V22_BACKUP_MESSAGE,
    );
  });

  it('still accepts a current-shaped file with empty decks and folders arrays', async () => {
    const course = await createCourse('Current');
    await createCard(course.id, 'front_back', 'Q', 'A');
    const backup = await exportDatabase();
    backup.decks = [];
    backup.folders = [];
    await importBackup(backup, 'replace');
    expect(await db.courses.count()).toBe(1);
  });

  it('replaces the database in replace mode', async () => {
    const deck = await createCourse('Old');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();

    await createCourse('Extra');
    expect(await db.schedulingUnits.count()).toBe(2);

    await importBackup(backup, 'replace');

    const decks = await db.schedulingUnits.toArray();
    const cards = await db.cards.toArray();
    expect(decks).toHaveLength(1);
    expect(decks[0].name).toBe('Old');
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('Q1');
  });

  it('rejects malformed structured payloads before replacing the database', async () => {
    const deck = await createCourse('Protected');
    const card = await createCard(deck.id, 'front_back', 'Q', 'A');
    const backup = await exportDatabase();
    backup.cards[0] = {
      ...backup.cards[0],
      payload: { v: 1, kind: 'working', scheme: [] } as never,
    };

    expect(validateBackup(backup)).toBe(false);
    await expect(importBackup(backup, 'replace')).rejects.toThrow('Invalid backup file.');
    expect(await db.cards.get(card.id)).toBeDefined();
  });

  it('round-trips a course, lesson and note in replace mode', async () => {
    const course = await createCourse('Biology A-Level');
    const lesson = await createLesson(course.id, 'Cells');
    await createNote(lesson.id, 'Cell Structure', '## Cell wall\nRigid outer layer.');
    const backup = await exportDatabase();

    // Populate some extra data that should be wiped on restore.
    await createCourse('Ephemeral');
    expect(await db.courses.count()).toBe(2);

    await importBackup(backup, 'replace');

    const courses = await db.courses.toArray();
    const lessons = await db.lessons.toArray();
    const notes = await db.notes.toArray();
    expect(courses).toHaveLength(1);
    expect(courses[0].name).toBe('Biology A-Level');
    expect(lessons).toHaveLength(1);
    expect(lessons[0].name).toBe('Cells');
    expect(notes).toHaveLength(1);
    expect(notes[0].name).toBe('Cell Structure');
  });

  it('rejects a parsed file with an invalid backup shape', async () => {
    await expect(
      readBackupFile(new File([JSON.stringify({ app: 'not-lacuna' })], 'invalid.json')),
    ).rejects.toThrow('This file is not a valid Lacuna backup.');
  });

  it('rejects an oversized backup before reading it', async () => {
    const file = new File(['ignored'], 'large.json');
    Object.defineProperty(file, 'size', { value: MAX_BACKUP_FILE_BYTES + 1 });
    const read = vi.spyOn(file, 'text');

    await expect(readBackupFile(file)).rejects.toThrow('Backup file exceeds the 200 MB limit.');
    expect(read).not.toHaveBeenCalled();
  });

  it('accepts a valid backup at the file size limit', async () => {
    const backup = await exportDatabase();
    const file = new File([JSON.stringify(backup)], 'backup.json');
    Object.defineProperty(file, 'size', { value: MAX_BACKUP_FILE_BYTES });

    await expect(readBackupFile(file)).resolves.toEqual(backup);
  });

  it('clears newer optional tables omitted by a legacy backup in replace mode', async () => {
    const course = await createCourse('Legacy Course');
    const lesson = await createLesson(course.id, 'Legacy Lesson');
    const note = await createNote(lesson.id, 'Legacy Note', 'Cell membrane');
    const deck = await createCourse('Legacy Deck');
    const card = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();
    const legacyBackup = { ...backup };
    delete legacyBackup.lessonCardExposures;
    delete legacyBackup.lessonCompletions;
    delete legacyBackup.practiceMilestones;

    await upsertLessonCardExposure(lesson.id, card.id, 100);
    await markLessonComplete(lesson.id, 200);
    await savePracticeMilestoneProgress('practice-legacy', course.id, 'scope-a', 1, 1, true, 300);
    await createNoteAnnotation(note.id, 0, 4, 'Cell');

    await importBackup(legacyBackup, 'replace');

    expect(await db.lessonCardExposures.count()).toBe(0);
    expect(await db.lessonCompletions.count()).toBe(0);
    expect(await db.practiceMilestones.count()).toBe(0);
    expect(await db.noteAnnotations.count()).toBe(0);
  });

  it('downloads a complete JSON backup and releases its object URL', async () => {
    const course = await createCourse('Exported course');
    const url = 'blob:backup-test';
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue(url);
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    try {
      await downloadBackup();
      expect(createObjectURL).toHaveBeenCalledOnce();
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      const downloaded = JSON.parse(await blob.text()) as BackupFile;
      expect(downloaded.courses?.map((item) => item.id)).toContain(course.id);
      expect(click).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith(url);
      expect(document.querySelector('a[href="blob:backup-test"]')).toBeNull();
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      click.mockRestore();
    }
  });
});
