import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup, validateBackup, BACKUP_VERSION } from './portability';
import {
  createCourse,
  createDeck,
  createCard,
  createLesson,
  createNote,
  createPracticeNode,
  createCourseExamDate,
  createSequence,
} from './repository';

async function reset() {
  await Promise.all([
    db.decks.clear(),
    db.cards.clear(),
    db.sessionHistory.clear(),
    db.userPerformance.clear(),
    db.assets.clear(),
    db.folders.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.lessonCards.clear(),
    db.practiceNodes.clear(),
    db.courseExamDates.clear(),
    db.sequences.clear(),
  ]);
}

describe('exportDatabase', () => {
  beforeEach(reset);

  it('exports a valid BackupFile with the current version', async () => {
    const deck = await createDeck('Biology');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');

    const backup = await exportDatabase();

    expect(backup.app).toBe('lacuna');
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(validateBackup(backup)).toBe(true);
    expect(backup.decks).toHaveLength(1);
    expect(backup.decks[0].name).toBe('Biology');
    expect(backup.cards).toHaveLength(1);
    expect(backup.cards[0].front).toBe('Q1');
  });
});

describe('importBackup', () => {
  beforeEach(reset);

  it('replaces the database in replace mode', async () => {
    const deck = await createDeck('Old');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();

    await createDeck('Extra');
    expect(await db.decks.count()).toBe(2);

    await importBackup(backup, 'replace');

    const decks = await db.decks.toArray();
    const cards = await db.cards.toArray();
    expect(decks).toHaveLength(1);
    expect(decks[0].name).toBe('Old');
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('Q1');
  });

  it('merges decks by interaction time in merge mode', async () => {
    const deck = await createDeck('Biology');
    const backup = await exportDatabase();

    // Simulate local activity so lastInteractedAt is strictly newer than the
    // backup's. Offsetting the captured value keeps this deterministic: relying
    // on Date.now() advancing fails when both writes land in the same
    // millisecond (the merge tie-break favours the backup, so local must be
    // unambiguously newer).
    await db.decks.update(deck.id, {
      examDate: deck.examDate + 1000,
      lastInteractedAt: (deck.lastInteractedAt ?? deck.createdAt) + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.decks.get(deck.id);
    expect(updated!.examDate).toBe(deck.examDate + 1000); // local wins because more recently interacted
  });

  it('adds missing cards in merge mode', async () => {
    const deck = await createDeck('MergeDeck');
    const card = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();

    await db.cards.delete(card.id);
    expect(await db.cards.count()).toBe(0);

    await importBackup(backup, 'merge');

    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('Q1');
  });

  it('appends non-duplicate session history in merge mode', async () => {
    const deck = await createDeck('HistoryDeck');
    const backup = await exportDatabase();

    await db.sessionHistory.add({
      timestamp: 1000,
      deckId: deck.id,
      averagePredictedRetrievability: 0.5,
    });

    const backupWithHistory = {
      ...backup,
      sessionHistory: [
        { timestamp: 1000, deckId: deck.id, averagePredictedRetrievability: 0.6 },
        { timestamp: 2000, deckId: deck.id, averagePredictedRetrievability: 0.7 },
      ],
    };

    await importBackup(backupWithHistory, 'merge');

    const history = await db.sessionHistory.toArray();
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.timestamp).sort()).toEqual([1000, 2000]);
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

  it('adds a missing course in merge mode without clobbering an existing local one', async () => {
    const existing = await createCourse('Local Course');
    const backup = await exportDatabase();

    // Create a second course locally after the backup was taken.
    await createCourse('New Local Course');
    expect(await db.courses.count()).toBe(2);

    // The backup contains only 'Local Course'.
    await importBackup(backup, 'merge');

    // 'Local Course' should remain; 'New Local Course' should not be wiped.
    const courses = await db.courses.toArray();
    expect(courses).toHaveLength(2);
    expect(courses.map((c) => c.id)).toContain(existing.id);
  });

  it('adds a missing practice node in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const node = await createPracticeNode(course.id, { type: 'manual', name: 'Node A' });
    const backup = await exportDatabase();

    await db.practiceNodes.delete(node.id);
    expect(await db.practiceNodes.count()).toBe(0);

    await importBackup(backup, 'merge');

    const nodes = await db.practiceNodes.toArray();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe('Node A');
  });

  it('resolves a practice node id collision by newer createdAt in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const node = await createPracticeNode(course.id, { type: 'manual', name: 'Old Name' });
    const backup = await exportDatabase();

    // Local copy is edited after the backup was taken, so its createdAt is newer.
    await db.practiceNodes.update(node.id, {
      name: 'New Name',
      createdAt: node.createdAt + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.practiceNodes.get(node.id);
    expect(updated!.name).toBe('New Name'); // local wins because more recently created/edited
  });

  it('adds a missing course exam date in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const examDate = await createCourseExamDate(course.id, 'Paper 1', Date.now() + 86400000);
    const backup = await exportDatabase();

    await db.courseExamDates.delete(examDate.id);
    expect(await db.courseExamDates.count()).toBe(0);

    await importBackup(backup, 'merge');

    const examDates = await db.courseExamDates.toArray();
    expect(examDates).toHaveLength(1);
    expect(examDates[0].name).toBe('Paper 1');
  });

  it('resolves a course exam date id collision by newer createdAt in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const examDate = await createCourseExamDate(course.id, 'Paper 1', Date.now() + 86400000);
    const backup = await exportDatabase();

    // Local copy is edited after the backup was taken, so its createdAt is newer.
    await db.courseExamDates.update(examDate.id, {
      name: 'Paper 1 (Resit)',
      createdAt: examDate.createdAt + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.courseExamDates.get(examDate.id);
    expect(updated!.name).toBe('Paper 1 (Resit)'); // local wins because more recently created/edited
  });

  it('round-trips a sequence in replace mode', async () => {
    const course = await createCourse('Chemistry');
    await createSequence(course.id, null, 'Group 1 metals', [
      { id: 'item-1', value: 'Lithium' },
      { id: 'item-2', value: 'Sodium' },
    ]);
    const backup = await exportDatabase();

    await createCourse('Ephemeral');
    expect(await db.courses.count()).toBe(2);

    await importBackup(backup, 'replace');

    const sequences = await db.sequences.toArray();
    expect(sequences).toHaveLength(1);
    expect(sequences[0].name).toBe('Group 1 metals');
    expect(sequences[0].items).toHaveLength(2);
    // The sequence's generated cards ride along as ordinary cards.
    const cards = await db.cards.where('sequenceItemId').equals('item-1').toArray();
    expect(cards).toHaveLength(1);
  });

  it('adds a missing sequence in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Group 1 metals', [
      { id: 'item-1', value: 'Lithium' },
    ]);
    const backup = await exportDatabase();

    await db.sequences.delete(sequence.id);
    expect(await db.sequences.count()).toBe(0);

    await importBackup(backup, 'merge');

    const sequences = await db.sequences.toArray();
    expect(sequences).toHaveLength(1);
    expect(sequences[0].name).toBe('Group 1 metals');
  });

  it('resolves a sequence id collision by newer createdAt in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Group 1 metals', [
      { id: 'item-1', value: 'Lithium' },
    ]);
    const backup = await exportDatabase();

    await db.sequences.update(sequence.id, {
      name: 'Group 1 metals (renamed)',
      createdAt: sequence.createdAt + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.sequences.get(sequence.id);
    expect(updated!.name).toBe('Group 1 metals (renamed)'); // local wins because more recently created/edited
  });

  it('imports an older backup without a sequences array cleanly', async () => {
    const deck = await createDeck('Legacy');
    await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();
    const { sequences: _sequences, ...legacyBackup } = backup;

    await importBackup(legacyBackup, 'replace');

    expect(await db.sequences.count()).toBe(0);
    const decks = await db.decks.toArray();
    expect(decks).toHaveLength(1);
  });
});
