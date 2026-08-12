import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  ensureCourseBankBackingDeck,
  ensureLessonBackingDeck,
  getSchedulingUnit,
  findBackingDeck,
  findBackingDecks,
  performanceForCourseBackingDecks,
  performanceForReviewUnit,
  performanceForReviewUnits,
  restoreReviewUnitPerformance,
  updateReviewUnitPerformance,
} from './backingDecks';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  deleteCourse,
  deleteCourseAssessment,
  deleteLesson,
  restoreLesson,
  snapshotCourse,
  snapshotLesson,
  restoreCourse,
  updateCourse,
  updateCourseAssessment,
  updateLesson,
} from './repository';
import type { Card } from './types';

async function reset(): Promise<void> {
  await Promise.all([
    db.courses.clear(),
    db.lessons.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.userPerformance.clear(),
    db.coursePerformance.clear(),
    db.schedulingPerformance.clear(),
    db.courseAssessments.clear(),
    db.schedulingUnits.clear(),
  ]);
}

describe('backing deck adapter', () => {
  beforeEach(reset);

  it('reads target scheduling configuration with a legacy-source fallback', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    await updateCourse(course.id, {
      maxReviewsPerDay: 30,
      dailyReviewGoal: 20,
      sessionTimeLimitMinutes: 25,
    });

    expect(await getSchedulingUnit(course.id)).toMatchObject({
      id: course.id,
      kind: 'course',
      maxReviewsPerDay: 30,
      dailyReviewGoal: 20,
      sessionTimeLimitMinutes: 25,
    });
    expect(await getSchedulingUnit(course.id, lesson.id)).toMatchObject({
      id: lesson.id,
      kind: 'lesson',
      maxReviewsPerDay: 30,
      dailyReviewGoal: 20,
      sessionTimeLimitMinutes: 25,
    });

    await db.schedulingUnits.delete(course.id);
    await db.schedulingUnits.delete(lesson.id);
    expect(await getSchedulingUnit(course.id)).toMatchObject({
      id: course.id,
      kind: 'course',
      maxReviewsPerDay: 30,
      dailyReviewGoal: 20,
      sessionTimeLimitMinutes: 25,
    });
    expect(await getSchedulingUnit(course.id, lesson.id)).toMatchObject({
      id: lesson.id,
      kind: 'lesson',
      maxReviewsPerDay: 30,
      dailyReviewGoal: 20,
      sessionTimeLimitMinutes: 25,
    });
  });

  it('keeps Course and Lesson scheduling configuration synchronised', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');

    const initialCourseUnit = await db.schedulingUnits.get(course.id);
    expect(initialCourseUnit).toMatchObject({
      kind: 'course',
      name: 'Biology',
      examDate: course.examDate,
    });
    expect(await db.schedulingPerformance.get(lesson.id)).toMatchObject({
      schedulingUnitId: lesson.id,
      totalCorrectReviews: 0,
    });

    await updateCourse(course.id, {
      name: 'Biology (updated)',
      maxReviewsPerDay: 30,
      autoOptimise: false,
    });
    expect(await db.schedulingUnits.get(course.id)).toMatchObject({
      name: 'Biology (updated)',
      maxReviewsPerDay: 30,
      autoOptimise: false,
    });
    expect(await db.schedulingUnits.get(lesson.id)).toMatchObject({
      maxReviewsPerDay: 30,
      autoOptimise: false,
    });

    const lessonDate = course.examDate + 86_400_000;
    await updateLesson(lesson.id, { examDate: lessonDate, timeZone: 'Europe/London' });
    expect(await db.schedulingUnits.get(lesson.id)).toMatchObject({
      examDate: lessonDate,
      timeZone: 'Europe/London',
    });

    const final = (await db.courseAssessments.where('courseId').equals(course.id).toArray())[0];
    await updateCourseAssessment(final.id, { examDate: course.examDate + 2 * 86_400_000 });
    expect(await db.schedulingUnits.get(course.id)).toMatchObject({
      examDate: course.examDate + 2 * 86_400_000,
    });
    // A lesson override remains authoritative when the Course assessment changes.
    expect(await db.schedulingUnits.get(lesson.id)).toMatchObject({ examDate: lessonDate });

    const checkpoint = await createCourseAssessment(course.id, 'Mock', course.examDate + 3 * 86_400_000);
    await deleteCourseAssessment(checkpoint.id);
    expect(await db.schedulingUnits.get(course.id)).toMatchObject({
      examDate: course.examDate + 2 * 86_400_000,
    });
  });

  it('restores deleted Lesson target rows with its snapshot', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    await db.schedulingPerformance.update(lesson.id, { totalCorrectReviews: 4 });
    const snapshot = await snapshotLesson(lesson.id);
    expect(snapshot?.schedulingUnit).toBeDefined();

    await deleteLesson(lesson.id);
    expect(await db.schedulingUnits.get(lesson.id)).toBeUndefined();
    expect(await db.schedulingPerformance.get(lesson.id)).toBeUndefined();

    await restoreLesson(snapshot!);
    expect(await db.schedulingUnits.get(lesson.id)).toMatchObject({ kind: 'lesson' });
    expect(await db.schedulingPerformance.get(lesson.id)).toMatchObject({ totalCorrectReviews: 4 });
  });

  it('restores deleted Course target rows with its snapshot', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    await db.coursePerformance.update(course.id, { totalCorrectReviews: 5 });
    const snapshot = await snapshotCourse(course.id);

    await deleteCourse(course.id);
    expect(await db.schedulingUnits.get(course.id)).toBeUndefined();
    expect(await db.schedulingUnits.get(lesson.id)).toBeUndefined();
    expect(await db.coursePerformance.get(course.id)).toBeUndefined();

    await restoreCourse(snapshot!);
    expect(await db.schedulingUnits.get(course.id)).toMatchObject({ kind: 'course' });
    expect(await db.schedulingUnits.get(lesson.id)).toMatchObject({ kind: 'lesson' });
    expect(await db.coursePerformance.get(course.id)).toMatchObject({ totalCorrectReviews: 5 });
  });

  it('owns one scheduling deck for a lesson', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');

    const first = await ensureLessonBackingDeck(course.id, lesson.id);
    const second = await ensureLessonBackingDeck(course.id, lesson.id);

    expect(second).toBe(first);
    expect(await db.decks.get(first)).toMatchObject({
      backingCourseId: course.id,
      backingLessonId: lesson.id,
      name: 'Cells',
    });
    expect(await db.schedulingPerformance.get(lesson.id)).toMatchObject({
      schedulingUnitId: lesson.id,
      courseId: course.id,
      lessonId: lesson.id,
    });
  });

  it('repairs a missing performance row without replacing existing calibration', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);

    await db.userPerformance.delete(deckId);
    await ensureLessonBackingDeck(course.id, lesson.id);
    expect(await db.userPerformance.get(deckId)).toBeDefined();

    await db.userPerformance.put({
      deckId,
      runningMeanResponseTime: 42,
      runningStdDevResponseTime: 3,
      m2: 9,
      totalCorrectReviews: 7,
    });
    await ensureLessonBackingDeck(course.id, lesson.id);
    expect(await db.userPerformance.get(deckId)).toMatchObject({
      runningMeanResponseTime: 42,
      totalCorrectReviews: 7,
    });
  });

  it('rebuilds a missing target performance row from legacy calibration', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);

    await db.userPerformance.put({
      deckId,
      runningMeanResponseTime: 42,
      runningStdDevResponseTime: 3,
      m2: 9,
      totalCorrectReviews: 7,
    });
    await db.schedulingPerformance.delete(lesson.id);

    await ensureLessonBackingDeck(course.id, lesson.id);

    expect(await db.schedulingPerformance.get(lesson.id)).toMatchObject({
      runningMeanResponseTime: 42,
      runningStdDevResponseTime: 3,
      m2: 9,
      totalCorrectReviews: 7,
    });
  });

  it('shares one newly-created lesson deck across concurrent requests', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');

    const ids = await Promise.all([
      ensureLessonBackingDeck(course.id, lesson.id),
      ensureLessonBackingDeck(course.id, lesson.id),
      ensureLessonBackingDeck(course.id, lesson.id),
    ]);

    expect(new Set(ids)).toEqual(new Set([ids[0]]));
    expect(
      await db.decks
        .filter((deck) => deck.backingCourseId === course.id && deck.backingLessonId === lesson.id)
        .count(),
    ).toBe(1);
    expect(await db.userPerformance.where('deckId').anyOf(ids).count()).toBe(1);
  });

  it('does not adopt an unowned lesson deck from another course', async () => {
    const course = await createCourse('Biology');
    const otherCourse = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Cells');
    const otherLesson = await createLesson(otherCourse.id, 'Cells');
    const otherDeckId = await ensureLessonBackingDeck(otherCourse.id, otherLesson.id);

    await db.decks.update(otherDeckId, {
      backingCourseId: undefined,
      backingLessonId: undefined,
    });
    await db.cards.add({
      id: 'other-course-card',
      deckId: otherDeckId,
      courseId: otherCourse.id,
      primaryLessonId: lesson.id,
      type: 'front_back',
      front: 'C',
      back: 'D',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 1,
      tags: [],
      suspended: false,
      buriedUntil: null,
    });

    const courseDeckId = await ensureLessonBackingDeck(course.id, lesson.id);

    expect(courseDeckId).not.toBe(otherDeckId);
    const otherDeck = await db.decks.get(otherDeckId);
    expect(otherDeck?.backingCourseId).toBeUndefined();
    expect(otherDeck?.backingLessonId).toBeUndefined();
    expect(await db.decks.get(courseDeckId)).toMatchObject({
      backingCourseId: course.id,
      backingLessonId: lesson.id,
    });
  });

  it('owns one scheduling deck for unassigned course cards', async () => {
    const course = await createCourse('Biology');

    const first = await ensureCourseBankBackingDeck(course.id);
    const second = await ensureCourseBankBackingDeck(course.id);

    expect(second).toBe(first);
    expect(await db.decks.get(first)).toMatchObject({
      backingCourseId: course.id,
      backingLessonId: null,
      name: 'Biology — Question bank',
    });
  });

  it('loads one performance row per backing deck for the requested course', async () => {
    const course = await createCourse('Biology');
    const otherCourse = await createCourse('Chemistry');
    await db.userPerformance.bulkPut([
      {
        deckId: 'deck-1',
        runningMeanResponseTime: 5,
        runningStdDevResponseTime: 1,
        m2: 1,
        totalCorrectReviews: 2,
      },
      {
        deckId: 'deck-2',
        runningMeanResponseTime: 6,
        runningStdDevResponseTime: 1,
        m2: 1,
        totalCorrectReviews: 2,
      },
      {
        deckId: 'other-deck',
        runningMeanResponseTime: 7,
        runningStdDevResponseTime: 1,
        m2: 1,
        totalCorrectReviews: 2,
      },
      {
        deckId: course.id,
        runningMeanResponseTime: 99,
        runningStdDevResponseTime: 1,
        m2: 1,
        totalCorrectReviews: 2,
      },
    ]);
    const cards = [
      { id: 'one', courseId: course.id, deckId: 'deck-1' },
      { id: 'two', courseId: course.id, deckId: 'deck-1' },
      { id: 'three', courseId: course.id, deckId: 'deck-2' },
      { id: 'four', courseId: otherCourse.id, deckId: 'other-deck' },
    ] as Card[];

    const performance = await performanceForCourseBackingDecks(course.id, cards);

    expect(performance.map((row) => row.deckId).sort()).toEqual(['deck-1', 'deck-2']);
    expect(performance.some((row) => row.deckId === course.id)).toBe(false);
  });

  it('uses target Course calibration and mirrors it for compatibility', async () => {
    await db.coursePerformance.put({
      courseId: 'course-1',
      runningMeanResponseTime: 12,
      runningStdDevResponseTime: 1,
      m2: 1,
      totalCorrectReviews: 3,
    });

    const before = await performanceForReviewUnit('course-1', 'course');
    expect(before).toMatchObject({ deckId: 'course-1', totalCorrectReviews: 3 });

    const updated = await updateReviewUnitPerformance('course-1', 4, 'course');
    expect(updated.totalCorrectReviews).toBe(4);
    expect(await db.coursePerformance.get('course-1')).toMatchObject({ totalCorrectReviews: 4 });
    expect(await db.userPerformance.get('course-1')).toMatchObject({ totalCorrectReviews: 4 });

    await restoreReviewUnitPerformance('course-1', before ?? null, 'course');
    expect(await db.coursePerformance.get('course-1')).toMatchObject({ totalCorrectReviews: 3 });
    expect(await db.userPerformance.get('course-1')).toMatchObject({ totalCorrectReviews: 3 });
  });

  it('prefers target scheduling pacing rows for Course workload estimates', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = {
      id: 'card-1',
      courseId: course.id,
      deckId: 'deck-1',
      schedulingUnitId: lesson.id,
    } as Card;
    await db.userPerformance.put({
      deckId: card.deckId,
      runningMeanResponseTime: 2,
      runningStdDevResponseTime: 1,
      m2: 1,
      totalCorrectReviews: 1,
    });
    await db.schedulingPerformance.put({
      schedulingUnitId: lesson.id,
      courseId: course.id,
      lessonId: lesson.id,
      runningMeanResponseTime: 8,
      runningStdDevResponseTime: 2,
      m2: 4,
      totalCorrectReviews: 8,
    });

    await expect(performanceForCourseBackingDecks(course.id, [card])).resolves.toEqual([
      expect.objectContaining({ deckId: card.deckId, totalCorrectReviews: 8 }),
    ]);
  });

  it('loads session calibration by the supplied unit keys', async () => {
    await db.userPerformance.bulkPut([
      {
        deckId: 'course-1',
        runningMeanResponseTime: 12,
        runningStdDevResponseTime: 1,
        m2: 1,
        totalCorrectReviews: 3,
      },
      {
        deckId: 'deck-1',
        runningMeanResponseTime: 8,
        runningStdDevResponseTime: 1,
        m2: 1,
        totalCorrectReviews: 2,
      },
    ]);

    const performance = await performanceForReviewUnits(['course-1', 'missing', 'deck-1']);

    expect(performance.map((row) => row?.deckId)).toEqual(['course-1', undefined, 'deck-1']);
  });

  it('updates and restores the supplied review unit without touching backing-deck calibration', async () => {
    await db.userPerformance.put({
      deckId: 'backing-deck',
      runningMeanResponseTime: 20,
      runningStdDevResponseTime: 0,
      m2: 0,
      totalCorrectReviews: 1,
    });

    const before = await performanceForReviewUnit('course-1');
    const updated = await updateReviewUnitPerformance('course-1', 4);

    expect(before).toBeUndefined();
    expect(updated).toMatchObject({
      deckId: 'course-1',
      runningMeanResponseTime: 4,
      totalCorrectReviews: 1,
    });
    expect(await db.userPerformance.get('backing-deck')).toMatchObject({
      runningMeanResponseTime: 20,
      totalCorrectReviews: 1,
    });

    await restoreReviewUnitPerformance('course-1', before ?? null);
    expect(await db.userPerformance.get('course-1')).toBeUndefined();

    const existing = await performanceForReviewUnit('backing-deck');
    await updateReviewUnitPerformance('backing-deck', 10);
    await restoreReviewUnitPerformance('backing-deck', existing ?? null);
    expect(await db.userPerformance.get('backing-deck')).toEqual(existing);
  });

  it('finds a legacy lesson deck from a primary card in the same course', async () => {
    const course = await createCourse('Biology');
    const otherCourse = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Cells');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    const otherDeckId = await ensureLessonBackingDeck(otherCourse.id, lesson.id);
    await db.decks.update(deckId, { backingCourseId: undefined, backingLessonId: undefined });
    await db.decks.update(otherDeckId, { backingCourseId: undefined, backingLessonId: undefined });
    // Insert the wrong-course row first so the course filter is genuinely exercised.
    await db.cards.add({
      id: 'card-other',
      deckId: otherDeckId,
      courseId: otherCourse.id,
      primaryLessonId: lesson.id,
      type: 'front_back',
      front: 'C',
      back: 'D',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 1,
      tags: [],
      suspended: false,
      buriedUntil: null,
    });
    await db.cards.add({
      id: 'card-course',
      deckId,
      courseId: course.id,
      primaryLessonId: lesson.id,
      type: 'front_back',
      front: 'A',
      back: 'B',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 1,
      tags: [],
      suspended: false,
      buriedUntil: null,
    });

    expect((await findBackingDeck(course.id, lesson.id))?.id).toBe(deckId);
  });

  it('finds a lesson deck from a linked-only course card', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const linkedLesson = await createLesson(course.id, 'Revision');
    const deckId = await ensureLessonBackingDeck(course.id, lesson.id);
    await db.decks.update(deckId, { backingCourseId: undefined, backingLessonId: undefined });
    await db.cards.add({
      id: 'linked-card',
      deckId,
      courseId: course.id,
      primaryLessonId: linkedLesson.id,
      type: 'front_back',
      front: 'A',
      back: 'B',
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
      history: [],
      createdAt: 1,
      tags: [],
      suspended: false,
      buriedUntil: null,
    });
    await db.lessonCards.add({
      id: 'link',
      lessonId: lesson.id,
      cardId: 'linked-card',
      createdAt: 1,
    });

    expect((await findBackingDeck(course.id, lesson.id))?.id).toBe(deckId);
  });

  it('resolves all question-bank scopes in one result', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const otherLesson = await createLesson(course.id, 'Revision');
    const lessonDeck = await ensureLessonBackingDeck(course.id, lesson.id);
    const bankDeck = await ensureCourseBankBackingDeck(course.id);
    const linkedDeck = await ensureLessonBackingDeck(course.id, otherLesson.id);

    await db.decks.update(lessonDeck, { backingCourseId: undefined, backingLessonId: undefined });
    await db.decks.update(linkedDeck, { backingCourseId: undefined, backingLessonId: undefined });
    await db.cards.bulkAdd([
      {
        id: 'lesson-card',
        deckId: lessonDeck,
        courseId: course.id,
        primaryLessonId: lesson.id,
        type: 'front_back',
        front: 'A',
        back: 'B',
        stability: null,
        difficulty: null,
        lastReviewed: null,
        reps: 0,
        lapses: 0,
        state: 0,
        due: null,
        scheduledDays: 0,
        learningSteps: 0,
        history: [],
        createdAt: 1,
        tags: [],
        suspended: false,
        buriedUntil: null,
      },
      {
        id: 'linked-card',
        deckId: linkedDeck,
        courseId: course.id,
        primaryLessonId: otherLesson.id,
        type: 'front_back',
        front: 'C',
        back: 'D',
        stability: null,
        difficulty: null,
        lastReviewed: null,
        reps: 0,
        lapses: 0,
        state: 0,
        due: null,
        scheduledDays: 0,
        learningSteps: 0,
        history: [],
        createdAt: 1,
        tags: [],
        suspended: false,
        buriedUntil: null,
      },
      {
        id: 'bank-card',
        deckId: bankDeck,
        courseId: course.id,
        primaryLessonId: null,
        type: 'front_back',
        front: 'E',
        back: 'F',
        stability: null,
        difficulty: null,
        lastReviewed: null,
        reps: 0,
        lapses: 0,
        state: 0,
        due: null,
        scheduledDays: 0,
        learningSteps: 0,
        history: [],
        createdAt: 1,
        tags: [],
        suspended: false,
        buriedUntil: null,
      },
    ]);
    await db.lessonCards.add({ id: 'lesson-link', lessonId: otherLesson.id, cardId: 'linked-card', createdAt: 1 });

    const resolved = await findBackingDecks(course.id, [lesson.id, otherLesson.id]);

    expect(resolved.get(lesson.id)?.id).toBe(lessonDeck);
    expect(resolved.get(otherLesson.id)?.id).toBe(linkedDeck);
    expect(resolved.get(null)?.id).toBe(bankDeck);
  });
});
