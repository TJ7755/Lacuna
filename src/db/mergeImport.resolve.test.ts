import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import type { SharePayload } from './share';
import {
  acceptAllMergeReview,
  acceptMergeReviewItems,
  importLineageFirstTime,
  mergeLineageUpdate,
  rejectAllMergeReview,
  rejectMergeReviewItems,
} from './mergeImport';

// Arc 7 §7.5 Task 7: review resolution. Payloads are plain object literals matching the
// wire shape (see mergeImport.test.ts), so these tests exercise the resolution functions
// against real `pendingMergeReviews` rows produced by `mergeLineageUpdate`.

function coursePayload(overrides: Partial<SharePayload & { v: 2 }> = {}): SharePayload {
  return {
    v: 2,
    by: 'Ms Teacher',
    at: 1000,
    course: { n: 'Biology', o: 0, c: 1000, e: 2_000_000, um: 'open' },
    lessons: [],
    li: 'lineage-1',
    rv: 1,
    ...overrides,
  } as SharePayload;
}

function lessonOne(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    i: 'lesson-1',
    n: 'Cells',
    notes: [{ oi: 'note-1', n: 'Intro', c: 'Cells are the basic unit of life.' }],
    cards: [{ id: 'card-1', k: 0 as const, f: 'What is a cell?', b: 'The basic unit of life.' }],
    ...overrides,
  };
}

async function pendingReviewId(courseId: string): Promise<string> {
  const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
  if (!review) throw new Error('Expected a pending review');
  return review.id;
}

describe('mergeImport: review resolution', () => {
  let courseId: string;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    const { course } = await importLineageFirstTime(coursePayload({ lessons: [lessonOne()] }));
    courseId = course.id;
  });

  it('accepts a queued update, applies it, and refreshes the mapping snapshot', async () => {
    await mergeLineageUpdate(courseId, coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells (revised)' })] }));
    const reviewId = await pendingReviewId(courseId);

    await acceptMergeReviewItems(reviewId, [{ kind: 'lesson', entityId: 'lesson-1' }]);

    expect((await db.lessons.get('lesson-1'))?.name).toBe('Cells (revised)');
    // Row emptied and removed.
    expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(0);
    // Snapshot refreshed so a re-import at the same content does not re-flag a student edit.
    const mapping = await db.lineageIdMappings.get('lineage-1');
    expect(mapping?.lessonSnapshots['lesson-1']?.name).toBe('Cells (revised)');
  });

  it('rejects a queued update, leaving the local copy untouched and clearing the row', async () => {
    await mergeLineageUpdate(courseId, coursePayload({ rv: 2, lessons: [lessonOne({ n: 'Cells (revised)' })] }));
    const reviewId = await pendingReviewId(courseId);

    await rejectMergeReviewItems(reviewId, [{ kind: 'lesson', entityId: 'lesson-1' }]);

    expect((await db.lessons.get('lesson-1'))?.name).toBe('Cells');
    expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(0);
  });

  it('accepts a removal: deletes the entity and drops it from the mapping', async () => {
    await mergeLineageUpdate(courseId, coursePayload({ rv: 2, lessons: [lessonOne({ cards: [] })] }));
    const reviewId = await pendingReviewId(courseId);

    await acceptMergeReviewItems(reviewId, [{ kind: 'card', entityId: 'card-1' }]);

    expect(await db.cards.get('card-1')).toBeUndefined();
    const mapping = await db.lineageIdMappings.get('lineage-1');
    expect(mapping?.cardIds).not.toContain('card-1');
    expect(mapping?.cardSnapshots['card-1']).toBeUndefined();
  });

  it('rejects a removal: keeps the entity', async () => {
    await mergeLineageUpdate(courseId, coursePayload({ rv: 2, lessons: [lessonOne({ cards: [] })] }));
    const reviewId = await pendingReviewId(courseId);

    await rejectMergeReviewItems(reviewId, [{ kind: 'card', entityId: 'card-1' }]);

    expect(await db.cards.get('card-1')).toBeDefined();
    expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(0);
  });

  it('takes the incoming version when accepting a content conflict', async () => {
    await db.notes.update('note-1', { content: 'My own rewritten notes.' });
    await mergeLineageUpdate(
      courseId,
      coursePayload({ rv: 2, lessons: [lessonOne({ notes: [{ oi: 'note-1', n: 'Intro', c: 'Teacher rewrote this.' }] })] }),
    );
    const reviewId = await pendingReviewId(courseId);

    await acceptMergeReviewItems(reviewId, [{ kind: 'note', entityId: 'note-1' }]);

    expect((await db.notes.get('note-1'))?.content).toBe('Teacher rewrote this.');
    const mapping = await db.lineageIdMappings.get('lineage-1');
    expect(mapping?.noteSnapshots['note-1']?.content).toBe('Teacher rewrote this.');
  });

  it('keeps the local version when rejecting a content conflict', async () => {
    await db.notes.update('note-1', { content: 'My own rewritten notes.' });
    await mergeLineageUpdate(
      courseId,
      coursePayload({ rv: 2, lessons: [lessonOne({ notes: [{ oi: 'note-1', n: 'Intro', c: 'Teacher rewrote this.' }] })] }),
    );
    const reviewId = await pendingReviewId(courseId);

    await rejectMergeReviewItems(reviewId, [{ kind: 'note', entityId: 'note-1' }]);

    expect((await db.notes.get('note-1'))?.content).toBe('My own rewritten notes.');
    expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(0);
  });

  it('deletes the entity when accepting a removal-conflict (teacher removed a student-edited item)', async () => {
    await db.cards.update('card-1', { front: 'My own version.' });
    await mergeLineageUpdate(courseId, coursePayload({ rv: 2, lessons: [lessonOne({ cards: [] })] }));
    const reviewId = await pendingReviewId(courseId);

    await acceptMergeReviewItems(reviewId, [{ kind: 'card', entityId: 'card-1' }]);

    expect(await db.cards.get('card-1')).toBeUndefined();
  });

  it('accepts all updates and removals but leaves conflicts queued', async () => {
    await db.notes.update('note-1', { content: 'My own rewritten notes.' });
    await mergeLineageUpdate(
      courseId,
      coursePayload({
        rv: 2,
        lessons: [
          lessonOne({
            n: 'Cells (revised)',
            notes: [{ oi: 'note-1', n: 'Intro', c: 'Teacher rewrote this.' }],
            cards: [],
          }),
        ],
      }),
    );
    const reviewId = await pendingReviewId(courseId);

    await acceptAllMergeReview(reviewId);

    // Update applied, removal applied.
    expect((await db.lessons.get('lesson-1'))?.name).toBe('Cells (revised)');
    expect(await db.cards.get('card-1')).toBeUndefined();
    // Conflict remains queued, local copy retained.
    expect((await db.notes.get('note-1'))?.content).toBe('My own rewritten notes.');
    const review = await db.pendingMergeReviews.where('courseId').equals(courseId).first();
    expect(review?.diff.conflicts).toHaveLength(1);
    expect(review?.diff.updates.lessons).toHaveLength(0);
    expect(review?.diff.removals.cardIds).toHaveLength(0);
  });

  it('rejects all outstanding items, including conflicts, and clears the row', async () => {
    await db.notes.update('note-1', { content: 'My own rewritten notes.' });
    await mergeLineageUpdate(
      courseId,
      coursePayload({
        rv: 2,
        lessons: [
          lessonOne({
            n: 'Cells (revised)',
            notes: [{ oi: 'note-1', n: 'Intro', c: 'Teacher rewrote this.' }],
          }),
        ],
      }),
    );
    const reviewId = await pendingReviewId(courseId);

    await rejectAllMergeReview(reviewId);

    expect((await db.lessons.get('lesson-1'))?.name).toBe('Cells');
    expect((await db.notes.get('note-1'))?.content).toBe('My own rewritten notes.');
    expect(await db.pendingMergeReviews.where('courseId').equals(courseId).count()).toBe(0);
  });
});
