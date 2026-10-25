import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import type { Course } from './types';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import { performanceForCourseBackingDecks, performanceForReviewUnit } from './backingDecks';
import { recordReview } from './repository';
import { hydrateCardsWithHistory } from './reviewHistoryRead';
import { coursePayload, lessonOne } from './mergeImport.testFixtures';

describe('mergeImport: merge apply', () => {
  let courseId: string;
  let course: Course;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    const imported = await importLineageFirstTime(coursePayload({ lessons: [lessonOne()] }));
    course = imported.course;
    courseId = course.id;
    await db.courses.update(courseId, { 'distributedCopy.autoAcceptUpdates': false });
  });

  it('re-importing an unchanged payload produces an empty diff (no queue, revision updated)', async () => {
    const before = (await db.courses.get(courseId))!.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    const result = await mergeLineageUpdate(
      courseId,
      coursePayload({ rv: 2, lessons: [lessonOne()] }),
    );
    expect(result).toMatchObject({
      createdLessons: 0,
      createdNotes: 0,
      createdCards: 0,
      appliedUpdates: 0,
      appliedRemovals: 0,
      queuedForReview: false,
      conflictCount: 0,
    });
    const course = await db.courses.get(courseId);
    expect(course?.distributedCopy?.revision).toBe(2);
    expect(course?.updatedAt).toBeGreaterThan(before);
    expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(0);
  });

  it("preserves the learner's introduction preference when the teacher publishes an update", async () => {
    await db.courses.update(courseId, { learnFirst: false });
    const payload = coursePayload({ rv: 2, lessons: [lessonOne()] });
    expect(payload.course.lf).toBeUndefined();
    await mergeLineageUpdate(courseId, payload);
    expect((await db.courses.get(courseId))?.learnFirst).toBe(false);
  });

  it('creates new lessons/notes/cards immediately, unconditionally', async () => {
    const payload = coursePayload({
      rv: 2,
      lessons: [lessonOne(), lessonOne({ i: 'lesson-2', n: 'Genetics', notes: [], cards: [] })],
    });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.createdLessons).toBe(1);
    expect(result.queuedForReview).toBe(false);
    expect(await db.lessons.get('lesson-2')).toBeDefined();
  });

  it('creates a stable Concept when a lineage update adds a Card', async () => {
    const result = await mergeLineageUpdate(
      courseId,
      coursePayload({
        rv: 2,
        lessons: [
          lessonOne({
            cards: [
              ...lessonOne().cards,
              { id: 'card-2', k: 0 as const, f: 'What contains DNA?', b: 'The nucleus.' },
            ],
          }),
        ],
      }),
    );

    expect(result.createdCards).toBe(1);
    const card = (await db.cards.get('card-2'))!;
    expect(card.conceptId).toBe('concept:lineage-card:card-2');
    expect(await db.concepts.get(card.conceptId)).toMatchObject({
      courseId,
      name: 'The nucleus.',
    });
  });

  it('queues a teacher update for review when autoAcceptUpdates is false', async () => {
    const payload = coursePayload({
      rv: 2,
      lessons: [lessonOne({ n: 'Cells (revised)' })],
    });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.appliedUpdates).toBe(0);
    expect(result.queuedForReview).toBe(true);

    const lesson = await db.lessons.get('lesson-1');
    expect(lesson?.name).toBe('Cells'); // untouched until reviewed

    const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
    expect(review?.diff.updates.lessons).toEqual([{ id: 'lesson-1', name: 'Cells (revised)' }]);
  });

  it('applies a teacher update silently when autoAcceptUpdates is true', async () => {
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });
    const payload = coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells (revised)' })] });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.appliedUpdates).toBe(1);
    expect(result.queuedForReview).toBe(false);

    const lesson = await db.lessons.get('lesson-1');
    expect(lesson?.name).toBe('Cells (revised)');
  });

  it('applies and snapshots a payload-only teacher update', async () => {
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });
    const payload = {
      v: 1 as const,
      kind: 'working' as const,
      scheme: [{ marks: 2, kind: 'waypoint' as const, expression: 'x = 4' }],
    };
    const result = await mergeLineageUpdate(
      courseId,
      coursePayload({
        rv: 2,
        lessons: [
          lessonOne({
            cards: [
              {
                id: 'card-1',
                k: 0 as const,
                f: 'What is a cell?',
                b: 'The basic unit of life.',
                p: payload,
              },
            ],
          }),
        ],
      }),
    );

    expect(result.appliedUpdates).toBe(1);
    expect((await db.cards.get('card-1'))?.payload).toEqual(payload);
    expect((await db.lineageIdMappings.get('lineage-1'))?.cardSnapshots['card-1'].payload).toEqual(
      payload,
    );
  });

  it('queues a conflict when the student has edited an entity the teacher also changed, leaving the local copy untouched', async () => {
    await db.notes.update('note-1', { content: 'My own rewritten notes.' });
    const payload = coursePayload({
      rv: 2,
      lessons: [
        lessonOne({ notes: [{ oi: 'note-1', n: 'Intro', c: 'Teacher rewrote this too.' }] }),
      ],
    });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.conflictCount).toBe(1);
    expect(result.queuedForReview).toBe(true);

    const note = await db.notes.get('note-1');
    expect(note?.content).toBe('My own rewritten notes.');

    const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
    expect(review?.diff.conflicts).toEqual([
      {
        entityId: 'note-1',
        kind: 'note',
        incoming: { i: 'note-1', n: 'Intro', c: 'Teacher rewrote this too.' },
        lessonId: 'lesson-1',
      },
    ]);
  });

  it('does not conflict when the student edit reproduces content identical to the incoming update (no merge since)', async () => {
    // Student edits the note to exactly what the teacher will later publish — content
    // matches on both sides, so there is nothing to reconcile.
    await db.notes.update('note-1', { content: 'Converged content.' });
    const payload = coursePayload({
      rv: 2,
      lessons: [lessonOne({ notes: [{ oi: 'note-1', n: 'Intro', c: 'Converged content.' }] })],
    });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.conflictCount).toBe(0);
    expect(result.queuedForReview).toBe(false);
  });

  it('queues a teacher removal for review as a plain removal after opting out', async () => {
    const payload = coursePayload({ rv: 2, lessons: [lessonOne({ cards: [] })] });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.queuedForReview).toBe(true);
    expect(await db.cards.get('card-1')).toBeDefined(); // untouched until reviewed
    const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
    expect(review?.diff.removals.cardIds).toEqual(['card-1']);
    expect(review?.diff.conflicts).toEqual([]);
  });

  it('queues a removal of a student-edited entity as a conflict, retaining the student copy', async () => {
    await db.cards.update('card-1', { front: 'My own version of this question.' });
    const payload = coursePayload({ rv: 2, lessons: [lessonOne({ cards: [] })] });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.conflictCount).toBe(1);
    const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
    expect(review?.diff.removals.cardIds).toEqual([]);
    expect(review?.diff.conflicts).toEqual([{ entityId: 'card-1', kind: 'card', incoming: null }]);
    expect(await db.cards.get('card-1')).toBeDefined();
  });

  it('applies a queued removal once autoAcceptUpdates is on', async () => {
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });
    const payload = coursePayload({ rv: 2, lessons: [lessonOne({ cards: [] })] });
    const result = await mergeLineageUpdate(courseId, payload);
    expect(result.appliedRemovals).toBe(1);
    expect(await db.cards.get('card-1')).toBeUndefined();
  });

  it('supersedes rather than accumulates: a second merge replaces the pending review row', async () => {
    await mergeLineageUpdate(
      courseId,
      coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells v2' })] }),
    );
    expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(1);

    await mergeLineageUpdate(
      courseId,
      coursePayload({ rv: 3, lessons: [lessonOne({ n: 'Cells v3' })] }),
    );
    const rows = await db.pendingMergeReviews.where('courseId').equals(courseId).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].revision).toBe(3);
    expect(rows[0].diff.updates.lessons).toEqual([{ id: 'lesson-1', name: 'Cells v3' }]);
  });

  it('does not replace newer local performance rows during a lineage update', async () => {
    const card = (await db.cards.get('card-1'))!;
    const backing = {
      deckId: card.deckId!,
      runningMeanResponseTime: 31,
      runningStdDevResponseTime: 2,
      m2: 8,
      totalCorrectReviews: 6,
    };
    const calibration = {
      deckId: courseId,
      runningMeanResponseTime: 17,
      runningStdDevResponseTime: 3,
      m2: 12,
      totalCorrectReviews: 4,
    };
    await db.userPerformance.bulkPut([backing, calibration]);
    await db.schedulingPerformance.put({
      schedulingUnitId: card.schedulingUnitId!,
      courseId,
      lessonId: card.primaryLessonId!,
      runningMeanResponseTime: backing.runningMeanResponseTime,
      runningStdDevResponseTime: backing.runningStdDevResponseTime,
      m2: backing.m2,
      totalCorrectReviews: backing.totalCorrectReviews,
      updatedAt: 0,
    });
    await db.coursePerformance.put({
      courseId,
      runningMeanResponseTime: calibration.runningMeanResponseTime,
      runningStdDevResponseTime: calibration.runningStdDevResponseTime,
      m2: calibration.m2,
      totalCorrectReviews: calibration.totalCorrectReviews,
      updatedAt: 0,
    });
    const backingDeck = (await db.schedulingUnits.get(card.schedulingUnitId))!;
    const localCourse = (await db.courses.get(courseId))!;
    const newerBackingInteraction = (backingDeck.lastInteractedAt ?? backingDeck.createdAt) + 1000;
    const newerCourseInteraction = (localCourse.lastInteractedAt ?? localCourse.createdAt) + 1000;
    await db.schedulingUnits.update(card.schedulingUnitId, {
      lastInteractedAt: newerBackingInteraction,
    });
    await db.schedulingUnits.update(card.schedulingUnitId!, {
      lastInteractedAt: newerBackingInteraction,
    });
    await db.courses.update(courseId, { lastInteractedAt: newerCourseInteraction });
    expect((await db.schedulingUnits.get(card.schedulingUnitId))?.lastInteractedAt).toBe(
      newerBackingInteraction,
    );
    expect((await db.schedulingUnits.get(card.schedulingUnitId!))?.lastInteractedAt).toBe(
      newerBackingInteraction,
    );
    expect((await db.courses.get(courseId))?.lastInteractedAt).toBe(newerCourseInteraction);
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });

    await mergeLineageUpdate(
      courseId,
      coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells revised' })] }),
    );

    expect((await db.schedulingUnits.get(card.schedulingUnitId))?.lastInteractedAt).toBe(
      newerBackingInteraction,
    );
    expect((await db.courses.get(courseId))?.lastInteractedAt).toBe(newerCourseInteraction);
    expect(await db.userPerformance.get(card.deckId!)).toEqual(backing);
    expect(await db.userPerformance.get(courseId)).toEqual(calibration);
    expect(
      (await performanceForCourseBackingDecks(courseId, [card])).map((row) => row.deckId),
    ).toEqual([card.schedulingUnitId]);
    expect(await performanceForReviewUnit(courseId, 'course')).toMatchObject({
      deckId: courseId,
      runningMeanResponseTime: 17,
      totalCorrectReviews: 4,
    });
    expect(await performanceForReviewUnit(card.schedulingUnitId!)).toMatchObject({
      deckId: card.schedulingUnitId,
      runningMeanResponseTime: 31,
      totalCorrectReviews: 6,
    });
  });

  it('preserves local review evidence through an auto-applied lineage update', async () => {
    const card = (await db.cards.get('card-1'))!;
    const result = await recordReview({
      card,
      eventId: 'event-lineage-consistency',
      sessionId: 'session-lineage-consistency',
      sessionKind: 'lesson',
      deck: course,
      kind: 'course',
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
      now: 1_725_123_456_789,
    });
    const reviewed = (await db.cards.get(card.id))!;
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });

    await mergeLineageUpdate(
      courseId,
      coursePayload({
        rv: 2,
        lessons: [
          lessonOne({
            cards: [
              { id: 'card-1', k: 0 as const, f: 'Revised question?', b: 'The basic unit of life.' },
            ],
          }),
        ],
      }),
    );

    const merged = (await db.cards.get(card.id))!;
    const canonical = await db.reviewHistory.where('cardId').equals(card.id).first();
    const hydrated = (await hydrateCardsWithHistory([merged]))[0];
    expect(merged.history).toEqual(reviewed.history);
    expect(canonical).toMatchObject({
      eventId: 'event-lineage-consistency',
      cardId: card.id,
      deckId: merged.deckId,
      schedulingUnitId: merged.deckId,
      timestamp: 1_725_123_456_789,
    });
    expect(hydrated.history).toHaveLength(1);
    expect(hydrated.history[0]).toMatchObject({
      eventId: 'event-lineage-consistency',
      timestamp: 1_725_123_456_789,
    });
    expect(result.recorded).toBe(true);
  });

  it('never modifies FSRS/scheduling fields on an auto-applied card update', async () => {
    await db.cards.update('card-1', {
      state: 2,
      stability: 4.2,
      difficulty: 6.1,
      reps: 3,
      lastReviewed: 5000,
      due: 9000,
    });
    await db.courses.update(courseId, {
      distributedCopy: {
        lineageId: 'lineage-1',
        revision: 1,
        locked: true,
        autoAcceptUpdates: true,
      },
    });
    const payload = coursePayload({
      rv: 2,
      lessons: [
        lessonOne({
          cards: [
            { id: 'card-1', k: 0 as const, f: 'Revised question?', b: 'The basic unit of life.' },
          ],
        }),
      ],
    });
    await mergeLineageUpdate(courseId, payload);
    const card = await db.cards.get('card-1');
    expect(card?.front).toBe('Revised question?');
    expect(card).toMatchObject({
      state: 2,
      stability: 4.2,
      difficulty: 6.1,
      reps: 3,
      lastReviewed: 5000,
      due: 9000,
    });
  });

  it('hands sequence-shaped payload items to the existing diffRegeneration path via updateSequence', async () => {
    const seqPayload = coursePayload({
      rv: 2,
      lessons: [lessonOne()],
      sequences: [
        {
          id: 'seq-1',
          n: 'Order of operations',
          items: [
            { id: 'item-1', v: 'Brackets' },
            { id: 'item-2', v: 'Orders' },
          ],
          cw: 2,
          pl: 0,
        },
      ],
    });
    await mergeLineageUpdate(courseId, seqPayload);

    const sequence = await db.sequences.get('seq-1');
    expect(sequence?.name).toBe('Order of operations');
    const generated = await db.cards.where('sequenceItemId').equals('item-1').toArray();
    expect(generated).toHaveLength(1);
    expect(generated[0].front).toContain('Order of operations');

    const mapping = await db.lineageIdMappings.get('lineage-1');
    expect(mapping?.sequenceIds).toEqual(['seq-1']);

    // A second merge with an edited sequence item regenerates content only.
    await mergeLineageUpdate(
      courseId,
      coursePayload({
        rv: 3,
        lessons: [lessonOne()],
        sequences: [
          {
            id: 'seq-1',
            n: 'Order of operations',
            items: [
              { id: 'item-1', v: 'Brackets and powers' },
              { id: 'item-2', v: 'Orders' },
            ],
            cw: 2,
            pl: 0,
          },
        ],
      }),
    );
    const regenerated = await db.cards.where('sequenceItemId').equals('item-1').toArray();
    expect(regenerated).toHaveLength(1);
    expect(regenerated[0].back).toBe('Brackets and powers');
  });

  it('hands occlusion-shaped payload items to updateOcclusion on a merge update', async () => {
    const occlusionPayload = (revision: number, y: number) =>
      coursePayload({
        rv: revision,
        lessons: [lessonOne()],
        occlusions: [
          {
            id: 'occ-1',
            n: 'Plant cell',
            ah: 'abc123',
            regions: [
              { id: 'region-1', r: 0, x: 0.1, y, w: 0.2, h: 0.1, a: 'Nucleus' },
              { id: 'region-2', r: 1, x: 0.5, y: 0.4, w: 0.1, h: 0.1, p: 'region-1' },
            ],
            pl: 0,
          },
        ],
      });

    await mergeLineageUpdate(courseId, occlusionPayload(2, 0.1));
    expect((await db.occlusions.get('occ-1'))?.regions).toHaveLength(2);
    const first = await db.cards.where('occlusionRegionId').equals('region-1').first();
    expect(first).toBeDefined();
    expect((await db.lineageIdMappings.get('lineage-1'))?.occlusionIds).toEqual(['occ-1']);

    // Moving a region regenerates content only: the card keeps its identity, so its
    // FSRS memory state survives the merge.
    await db.cards.update(first!.id, { reps: 4, stability: 12 });
    await mergeLineageUpdate(courseId, occlusionPayload(3, 0.3));

    const after = await db.cards.where('occlusionRegionId').equals('region-1').toArray();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(first!.id);
    expect(after[0].reps).toBe(4);
    expect(after[0].stability).toBe(12);
    expect((await db.occlusions.get('occ-1'))?.regions[0].y).toBe(0.3);
  });
});
