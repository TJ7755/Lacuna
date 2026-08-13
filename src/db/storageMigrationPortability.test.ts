import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportDatabase, importBackup } from './portability';
import { db } from './schema';
import { createCard, createCourse, createDeck, createLesson } from './repository';
import { ensureLessonBackingDeck } from './backingDecks';
import type { BackupFile } from './types';

async function reset(): Promise<void> {
  await Promise.all([
    db.cards.clear(),
    db.decks.clear(),
    db.folders.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.courseAssessments.clear(),
    db.userPerformance.clear(),
    db.sessionHistory.clear(),
    db.reviewHistory.clear(),
    db.schedulingUnits.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
  ]);
}

describe('domain storage portability', () => {
  beforeEach(reset);

  it('round-trips target scheduling units and split performance', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    const card = await createCard(deckId, 'front_back', 'Q', 'A', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });
    await db.userPerformance.put({
      deckId,
      runningMeanResponseTime: 4,
      runningStdDevResponseTime: 1,
      m2: 2,
      totalCorrectReviews: 6,
    });
    await db.schedulingPerformance.put({
      schedulingUnitId: lesson.id,
      courseId: course.id,
      lessonId: lesson.id,
      runningMeanResponseTime: 4,
      runningStdDevResponseTime: 1,
      m2: 2,
      totalCorrectReviews: 6,
    });

    const backup = await exportDatabase();
    expect(backup.schedulingUnits).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: lesson.id, kind: 'lesson' })]),
    );
    expect(backup.schedulingPerformance).toEqual(
      expect.arrayContaining([expect.objectContaining({ schedulingUnitId: lesson.id })]),
    );

    await reset();
    await importBackup(backup, 'replace');

    expect(await db.cards.get(card.id)).toMatchObject({ schedulingUnitId: lesson.id });
    expect(await db.schedulingUnits.get(lesson.id)).toMatchObject({ kind: 'lesson' });
    expect(await db.schedulingPerformance.get(lesson.id)).toMatchObject({ totalCorrectReviews: 6 });
  });

  it('reconstructs target projections when importing a legacy Deck-only backup', async () => {
    const deck = await createDeck('Legacy deck');
    const card = await createCard(deck.id, 'front_back', 'Q', 'A');
    const current = await exportDatabase();
    const {
      courses: _courses,
      lessons: _lessons,
      courseAssessments: _assessments,
      schedulingUnits: _units,
      coursePerformance: _coursePerformance,
      schedulingPerformance: _schedulingPerformance,
      reviewHistory: _reviewHistory,
      ...legacyBackup
    } = current;

    await reset();
    await importBackup(legacyBackup as BackupFile, 'replace');

    expect(await db.decks.get(deck.id)).toMatchObject({ name: 'Legacy deck' });
    expect(await db.cards.get(card.id)).toMatchObject({ schedulingUnitId: deck.id });
    expect(await db.courses.get(deck.id)).toMatchObject({ id: deck.id, name: 'Legacy deck' });
    expect(await db.schedulingUnits.get(deck.id)).toMatchObject({
      id: deck.id,
      kind: 'course',
      courseId: deck.id,
    });
    expect(await db.schedulingPerformance.get(deck.id)).toMatchObject({
      schedulingUnitId: deck.id,
    });
  });

  it('promotes every foldered legacy Deck to a Course and reports the discarded hierarchy', async () => {
    const first = await createDeck('Organic chemistry');
    const second = await createDeck('Physical chemistry');
    await db.folders.add({
      id: 'chemistry-folder',
      name: 'Chemistry',
      parentId: null,
      createdAt: first.createdAt - 1,
    });
    await db.decks.bulkUpdate([
      { key: first.id, changes: { folderId: 'chemistry-folder' } },
      { key: second.id, changes: { folderId: 'chemistry-folder' } },
    ]);
    const firstCard = await createCard(first.id, 'front_back', 'Alkane', 'CnH2n+2');
    const secondCard = await createCard(second.id, 'front_back', 'Enthalpy', 'Heat content');
    const current = await exportDatabase();
    const {
      courses: _courses,
      lessons: _lessons,
      courseAssessments: _assessments,
      schedulingUnits: _units,
      coursePerformance: _coursePerformance,
      schedulingPerformance: _schedulingPerformance,
      reviewHistory: _reviewHistory,
      ...legacyBackup
    } = current;

    await reset();
    const report = await importBackup(legacyBackup as BackupFile, 'replace');

    expect(report).toEqual({ discardedFolderNames: ['Chemistry'] });
    expect((await db.courses.toArray()).map((course) => course.name).sort()).toEqual([
      'Organic chemistry',
      'Physical chemistry',
    ]);
    expect(await db.cards.get(firstCard.id)).toMatchObject({
      courseId: first.id,
      schedulingUnitId: first.id,
    });
    expect(await db.cards.get(secondCard.id)).toMatchObject({
      courseId: second.id,
      schedulingUnitId: second.id,
    });
  });

  it('merges target projections idempotently without duplicating units', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    await createCard(deckId, 'front_back', 'Q', 'A', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });
    const backup = await exportDatabase();

    await importBackup(backup, 'replace');
    await importBackup(backup, 'merge');

    expect(await db.schedulingUnits.where('id').equals(lesson.id).count()).toBe(1);
    expect(await db.coursePerformance.where('courseId').equals(course.id).count()).toBe(1);
    expect(await db.schedulingPerformance.where('schedulingUnitId').equals(lesson.id).count()).toBe(1);
  });

  it('does not let a stale merge backup regress target projections', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    await createCard(deckId, 'front_back', 'Q', 'A', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });
    const backup = await exportDatabase();
    await importBackup(backup, 'replace');

    const localUnit = (await db.schedulingUnits.get(lesson.id))!;
    const localInteraction = localUnit.createdAt + 100;
    await db.schedulingUnits.update(lesson.id, { lastInteractedAt: localInteraction });
    await db.coursePerformance.put({
      courseId: course.id,
      runningMeanResponseTime: 9,
      runningStdDevResponseTime: 2,
      m2: 4,
      totalCorrectReviews: 99,
    });
    await db.schedulingPerformance.put({
      schedulingUnitId: lesson.id,
      courseId: course.id,
      lessonId: lesson.id,
      runningMeanResponseTime: 9,
      runningStdDevResponseTime: 2,
      m2: 4,
      totalCorrectReviews: 99,
    });

    await importBackup(backup, 'merge');

    expect(await db.schedulingUnits.get(lesson.id)).toMatchObject({ lastInteractedAt: localInteraction });
    expect(await db.coursePerformance.get(course.id)).toMatchObject({ totalCorrectReviews: 99 });
    expect(await db.schedulingPerformance.get(lesson.id)).toMatchObject({ totalCorrectReviews: 99 });
  });

  it('rebuilds target units when importing an earlier v21 projection without metadata', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    const card = await createCard(deckId, 'front_back', 'Q', 'A', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });
    const current = await exportDatabase();
    const legacyProjectionBackup = {
      ...current,
      schedulingUnits: current.schedulingUnits!.map(({ createdAt: _createdAt, ...unit }) => unit),
    } as BackupFile;

    await reset();
    await importBackup(legacyProjectionBackup, 'replace');

    expect(await db.cards.get(card.id)).toMatchObject({ schedulingUnitId: lesson.id });
    expect(await db.schedulingUnits.get(lesson.id)).toMatchObject({
      kind: 'lesson',
      createdAt: lesson.createdAt,
    });
  });

  it('reconstructs target projections and stamps lesson cards when importing an older backup', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    const card = await createCard(deckId, 'front_back', 'Q', 'A', [], {
      courseId: course.id,
      primaryLessonId: lesson.id,
    });
    const current = await exportDatabase();
    const { schedulingUnits: _units, coursePerformance: _coursePerformance, schedulingPerformance: _schedulingPerformance, ...oldBackup } = current;

    await reset();
    await importBackup(oldBackup, 'replace');

    expect(await db.cards.get(card.id)).toMatchObject({ schedulingUnitId: lesson.id });
    expect(await db.schedulingUnits.get(lesson.id)).toMatchObject({ kind: 'lesson' });
    expect(await db.schedulingPerformance.get(lesson.id)).toBeDefined();
  });
});
