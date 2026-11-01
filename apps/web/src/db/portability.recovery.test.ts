import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup } from './portability';
import {
  createCourse,
  createCard,
  createLesson,
  createNote,
  createPracticeNode,
  createLessonCard,
  markLessonComplete,
  savePracticeMilestoneProgress,
  upsertLessonCardExposure,
} from './repository';
import { performanceForCourseBackingDecks, performanceForReviewUnit } from './backingDecks';

import { reset } from './portability.testFixtures';

describe('backup recovery', () => {
  beforeEach(reset);

  it.each(['replace', 'merge'] as const)(
    'round-trips course and scheduling-unit performance distinctly in %s mode',
    async (mode) => {
      const course = await createCourse('Key-space portability');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
      const backing = {
        schedulingUnitId: card.schedulingUnitId,
        courseId: course.id,
        lessonId: lesson.id,
        runningMeanResponseTime: 41,
        runningStdDevResponseTime: 2,
        m2: 8,
        totalCorrectReviews: 9,
        updatedAt: 0,
      };
      const calibration = {
        courseId: course.id,
        runningMeanResponseTime: 73,
        runningStdDevResponseTime: 3,
        m2: 18,
        totalCorrectReviews: 11,
        updatedAt: 0,
      };
      await db.schedulingPerformance.put(backing);
      await db.coursePerformance.put(calibration);
      const backup = await exportDatabase();

      expect(backup.userPerformance).toEqual([]);
      expect(backup.schedulingPerformance).toEqual(expect.arrayContaining([backing]));
      expect(backup.coursePerformance).toEqual(expect.arrayContaining([calibration]));

      let expectedBacking = backing;
      let expectedCalibration = calibration;
      if (mode === 'merge') {
        const backingDeck = (await db.schedulingUnits.get(card.schedulingUnitId))!;
        const storedCourse = (await db.courses.get(course.id))!;
        expectedBacking = { ...backing, runningMeanResponseTime: 101, totalCorrectReviews: 21 };
        expectedCalibration = {
          ...calibration,
          runningMeanResponseTime: 202,
          totalCorrectReviews: 22,
        };
        await db.schedulingUnits.update(card.schedulingUnitId, {
          lastInteractedAt: (backingDeck.lastInteractedAt ?? backingDeck.createdAt) + 1000,
        });
        await db.courses.update(course.id, {
          lastInteractedAt: (storedCourse.lastInteractedAt ?? storedCourse.createdAt) + 1000,
        });
        await db.schedulingPerformance.put(expectedBacking);
        await db.coursePerformance.put(expectedCalibration);
      }

      await importBackup(backup, mode);

      expect(await db.schedulingPerformance.get(card.schedulingUnitId)).toEqual(expectedBacking);
      expect(await db.coursePerformance.get(course.id)).toEqual(expectedCalibration);
      const restoredCard = (await db.cards.get(card.id))!;
      expect(
        (await performanceForCourseBackingDecks(course.id, [restoredCard])).map(
          (row) => row.deckId,
        ),
      ).toEqual([card.schedulingUnitId]);
      expect(await performanceForReviewUnit(course.id, 'course')).toMatchObject({
        deckId: course.id,
      });
      expect(await performanceForReviewUnit(restoredCard.schedulingUnitId!)).toMatchObject({
        deckId: restoredCard.schedulingUnitId,
      });
    },
  );

  it('merges decks by interaction time in merge mode', async () => {
    const deck = await createCourse('Biology');
    const backup = await exportDatabase();

    // Simulate local activity so lastInteractedAt is strictly newer than the
    // backup's. Offsetting the captured value keeps this deterministic: relying
    // on Date.now() advancing fails when both writes land in the same
    // millisecond (the merge tie-break favours the backup, so local must be
    // unambiguously newer).
    await db.schedulingUnits.update(deck.id, {
      examDate: deck.examDate! + 1000,
      lastInteractedAt: (deck.lastInteractedAt ?? deck.createdAt) + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.schedulingUnits.get(deck.id);
    expect(updated!.examDate).toBe(deck.examDate! + 1000); // local wins because more recently interacted
  });

  it('adds missing cards in merge mode', async () => {
    const deck = await createCourse('MergeDeck');
    const card = await createCard(deck.id, 'front_back', 'Q1', 'A1');
    const backup = await exportDatabase();

    await db.cards.delete(card.id);
    expect(await db.cards.count()).toBe(0);

    await importBackup(backup, 'merge');

    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('Q1');
  });

  it('keeps a locally edited note when an incoming backup has the same creation time', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const note = await createNote(lesson.id, 'Cell note', 'Old content');
    const backup = await exportDatabase();

    await db.notes.update(note.id, { content: 'Local edit' });
    await importBackup(backup, 'merge');

    expect((await db.notes.get(note.id))?.content).toBe('Local edit');
  });

  it('uses course interaction time when merging course calibration', async () => {
    const course = await createCourse('Biology');
    await db.userPerformance.put({
      deckId: course.id,
      runningMeanResponseTime: 10,
      runningStdDevResponseTime: 0,
      m2: 0,
      totalCorrectReviews: 1,
    });
    const backup = await exportDatabase();

    await db.courses.update(course.id, { lastInteractedAt: course.createdAt + 1000 });
    await db.userPerformance.update(course.id, {
      runningMeanResponseTime: 99,
      totalCorrectReviews: 2,
    });
    await importBackup(backup, 'merge');

    expect((await db.userPerformance.get(course.id))?.runningMeanResponseTime).toBe(99);
  });

  it('uses incoming legacy calibration when its course was interacted with later', async () => {
    const course = await createCourse('Biology');
    await db.userPerformance.put({
      deckId: course.id,
      runningMeanResponseTime: 10,
      runningStdDevResponseTime: 0,
      m2: 0,
      totalCorrectReviews: 1,
    });
    const backup = await exportDatabase();
    backup.userPerformance = [
      {
        deckId: course.id,
        runningMeanResponseTime: 42,
        runningStdDevResponseTime: 1,
        m2: 2,
        totalCorrectReviews: 4,
      },
    ];
    backup.courses = backup.courses?.map((record) => ({
      ...record,
      lastInteractedAt: (record.lastInteractedAt ?? record.createdAt) + 1000,
    }));

    await importBackup(backup, 'merge');

    expect((await db.userPerformance.get(course.id))?.runningMeanResponseTime).toBe(42);
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

  it('merges teaching progress by its own timestamps without losing linked cards', async () => {
    const course = await createCourse('Biology');
    const taughtLesson = await createLesson(course.id, 'Cells');
    const linkedLesson = await createLesson(course.id, 'Cell division');
    const emptyLesson = await createLesson(course.id, 'Revision');
    const card = await createLessonCard(course.id, taughtLesson.id, 'front_back', 'Q', 'A');
    await db.lessonCards.put({
      id: 'linked-card',
      lessonId: linkedLesson.id,
      cardId: card.id,
      createdAt: 100,
      updatedAt: 100,
    });
    await upsertLessonCardExposure(taughtLesson.id, card.id, 100);
    await markLessonComplete(emptyLesson.id, 100);
    await savePracticeMilestoneProgress('practice-cells', course.id, 'cells-v1', 2, 3, false, 100);

    const backup = await exportDatabase();
    const incomingLink = backup.lessonCards?.find((link) => link.id === 'linked-card');
    const incomingExposure = backup.lessonCardExposures?.find(
      (exposure) => exposure.lessonId === taughtLesson.id,
    );
    const incomingCompletion = backup.lessonCompletions?.find(
      (completion) => completion.lessonId === emptyLesson.id,
    );
    const incomingMilestone = backup.practiceMilestones?.find(
      (milestone) => milestone.nodeKey === 'practice-cells',
    );
    expect(
      incomingLink && incomingExposure && incomingCompletion && incomingMilestone,
    ).toBeTruthy();

    await db.lessonCards.update('linked-card', { createdAt: 50, updatedAt: 50 });
    await db.lessonCardExposures.put({ ...incomingExposure!, taughtAt: 200, updatedAt: 200 });
    await db.lessonCompletions.put({ ...incomingCompletion!, completedAt: 200, updatedAt: 200 });
    await db.practiceMilestones.put({ ...incomingMilestone!, securedCardCount: 0, updatedAt: 50 });

    await importBackup(backup, 'merge');

    expect(await db.lessonCards.get('linked-card')).toEqual(incomingLink);
    expect(await db.lessonCardExposures.get([taughtLesson.id, card.id])).toEqual(incomingExposure);
    expect(await db.lessonCompletions.get(emptyLesson.id)).toEqual(incomingCompletion);
    expect(await db.practiceMilestones.get('practice-cells')).toEqual(incomingMilestone);
  });
});
