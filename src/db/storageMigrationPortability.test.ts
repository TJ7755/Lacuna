import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportDatabase, importBackup } from './portability';
import { db } from './schema';
import { createCard, createCourse, createLesson } from './repository';
import { ensureLessonBackingDeck } from './backingDecks';
import type { BackupFile } from './types';

async function reset(): Promise<void> {
  await Promise.all([
    db.cards.clear(),
    db.decks.clear(),
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
