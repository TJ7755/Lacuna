import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createNote,
  createSequence,
  deleteCards,
  deleteLesson,
  deleteSequence,
  linkCardsToLesson,
  markLessonComplete,
  restoreCards,
  restoreLesson,
  restoreSequence,
  snapshotCards,
  snapshotLesson,
  snapshotSequence,
  upsertLessonCardExposure,
} from './repository';
import {
  createOcclusion,
  deleteOcclusion,
  restoreOcclusion,
  snapshotOcclusion,
} from './occlusionRepository';
import { labelRegion, reset } from './repository.mutation.testFixtures';

describe('repository snapshot resurrection', () => {
  beforeEach(reset);

  it('restoreLesson keeps original updatedAt values and clears matching tombstones', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Intro');
    const note = await createNote(lesson.id, 'Notes', 'Body');
    await markLessonComplete(lesson.id, 200);
    await db.lessons.update(lesson.id, { updatedAt: 42 });
    await db.notes.update(note.id, { updatedAt: 43 });
    await db.lessonCompletions.update(lesson.id, { updatedAt: 44 });

    const snapshot = await snapshotLesson(lesson.id);
    expect(snapshot?.lesson.updatedAt).toBe(42);
    await deleteLesson(lesson.id);
    expect(await db.tombstones.get(['lessons', lesson.id])).toBeDefined();
    expect(await db.tombstones.get(['notes', note.id])).toBeDefined();
    expect(await db.tombstones.get(['lessonCompletions', lesson.id])).toBeDefined();

    await restoreLesson(snapshot!);
    expect(await db.lessons.get(lesson.id)).toMatchObject({ name: 'Intro', updatedAt: 42 });
    expect(await db.notes.get(note.id)).toMatchObject({ updatedAt: 43 });
    expect(await db.lessonCompletions.get(lesson.id)).toMatchObject({ updatedAt: 44 });
    expect(await db.tombstones.get(['lessons', lesson.id])).toBeUndefined();
    expect(await db.tombstones.get(['notes', note.id])).toBeUndefined();
    expect(await db.tombstones.get(['lessonCompletions', lesson.id])).toBeUndefined();
  });

  it('restoreSequence keeps original updatedAt values and clears matching tombstones', async () => {
    const course = await createCourse('Chemistry');
    const sequence = await createSequence(course.id, null, 'Halogens', [
      { id: 'restore-seq', value: 'F' },
    ]);
    const [card] = await db.cards.where('sequenceItemId').equals('restore-seq').toArray();
    await db.sequences.update(sequence.id, { updatedAt: 52 });
    await db.cards.update(card.id, { updatedAt: 53 });

    const snapshot = await snapshotSequence(sequence.id);
    expect(snapshot?.sequence.updatedAt).toBe(52);
    await deleteSequence(sequence.id);
    expect(await db.tombstones.get(['sequences', sequence.id])).toBeDefined();
    expect(await db.tombstones.get(['cards', card.id])).toBeDefined();

    await restoreSequence(snapshot!);
    expect(await db.sequences.get(sequence.id)).toMatchObject({ name: 'Halogens', updatedAt: 52 });
    expect(await db.cards.get(card.id)).toMatchObject({ updatedAt: 53 });
    expect(await db.tombstones.get(['sequences', sequence.id])).toBeUndefined();
    expect(await db.tombstones.get(['cards', card.id])).toBeUndefined();
  });

  it('restoreOcclusion keeps original updatedAt values and clears matching tombstones', async () => {
    const course = await createCourse('Biology');
    const occlusion = await createOcclusion(course.id, null, 'Cell', 'hash-restore', [
      labelRegion('restore-occ'),
    ]);
    const [card] = await db.cards.where('occlusionRegionId').equals('restore-occ').toArray();
    await db.occlusions.update(occlusion.id, { updatedAt: 62 });
    await db.cards.update(card.id, { updatedAt: 63 });

    const snapshot = await snapshotOcclusion(occlusion.id);
    expect(snapshot?.occlusion.updatedAt).toBe(62);
    await deleteOcclusion(occlusion.id);
    expect(await db.tombstones.get(['occlusions', occlusion.id])).toBeDefined();
    expect(await db.tombstones.get(['cards', card.id])).toBeDefined();

    await restoreOcclusion(snapshot!);
    expect(await db.occlusions.get(occlusion.id)).toMatchObject({ name: 'Cell', updatedAt: 62 });
    expect(await db.cards.get(card.id)).toMatchObject({ updatedAt: 63 });
    expect(await db.tombstones.get(['occlusions', occlusion.id])).toBeUndefined();
    expect(await db.tombstones.get(['cards', card.id])).toBeUndefined();
  });

  it('restoreCards keeps original updatedAt values and clears matching tombstones', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Intro');
    const linked = await createLesson(course.id, 'Review');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    const [link] = await linkCardsToLesson(linked.id, [card.id]);
    await upsertLessonCardExposure(linked.id, card.id, 100);
    await db.cards.update(card.id, { updatedAt: 72 });
    await db.lessonCards.update(link.id, { updatedAt: 73 });

    const snapshot = await snapshotCards([card.id]);
    expect(snapshot[0].updatedAt).toBe(72);
    await deleteCards([card.id]);
    expect(await db.tombstones.get(['cards', card.id])).toBeDefined();
    expect(await db.tombstones.get(['lessonCards', link.id])).toBeDefined();
    expect(
      await db.tombstones.get(['lessonCardExposures', `${linked.id}:${card.id}`]),
    ).toBeDefined();

    await restoreCards(snapshot);
    expect(await db.cards.get(card.id)).toMatchObject({ updatedAt: 72 });
    expect(await db.lessonCards.get(link.id)).toMatchObject({ updatedAt: 73 });
    expect(await db.tombstones.get(['cards', card.id])).toBeUndefined();
    expect(await db.tombstones.get(['lessonCards', link.id])).toBeUndefined();
    expect(
      await db.tombstones.get(['lessonCardExposures', `${linked.id}:${card.id}`]),
    ).toBeUndefined();
  });
});
