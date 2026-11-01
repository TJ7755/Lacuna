import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createLesson,
  detachCourse,
  setCourseAutoAcceptUpdates,
  setCourseShareId,
  clearCourseShareId,
  publishCourse,
  updateCourse,
} from './repository';
import { reset } from './courseRepository.testFixtures';

describe('publishCourse', () => {
  beforeEach(reset);

  it('creates a fresh lineage id and revision 1 on first publish', async () => {
    const course = await createCourse('Publish test');
    expect(course.distribution).toBeUndefined();
    const before = Date.now();

    const distribution = await publishCourse(course.id);

    expect(typeof distribution.lineageId).toBe('string');
    expect(distribution.lineageId.length).toBeGreaterThan(0);
    expect(distribution.revision).toBe(1);
    expect(distribution.publishedAt).toBeGreaterThanOrEqual(before);
    expect(await db.courses.get(course.id)).toMatchObject({ distribution });
  });

  it('keeps the same lineage id and increments revision on republish', async () => {
    const course = await createCourse('Republish test');
    const first = await publishCourse(course.id);

    const second = await publishCourse(course.id);
    const third = await publishCourse(course.id);

    expect(second.lineageId).toBe(first.lineageId);
    expect(second.revision).toBe(2);
    expect(second.publishedAt).toBeGreaterThanOrEqual(first.publishedAt);
    expect(third.lineageId).toBe(first.lineageId);
    expect(third.revision).toBe(3);
    expect(await db.courses.get(course.id)).toMatchObject({ distribution: third });
  });

  it('rejects publishing a course that does not exist', async () => {
    await expect(publishCourse('missing')).rejects.toThrow('could not be found');
  });

  it('keeps the share link id across republishes', async () => {
    const course = await createCourse('Share link test');
    await publishCourse(course.id);
    await setCourseShareId(course.id, 'a'.repeat(32), 1);

    const republished = await publishCourse(course.id);

    expect(republished.shareId).toBe('a'.repeat(32));
    expect(republished.shareRevision).toBe(1);
    expect(republished.revision).toBe(2);
    expect(await db.courses.get(course.id)).toMatchObject({ distribution: republished });
  });
});

describe('setCourseShareId', () => {
  beforeEach(reset);

  it('records the share id and uploaded revision while leaving the rest untouched', async () => {
    const course = await createCourse('Share id test');
    const distribution = await publishCourse(course.id);

    await setCourseShareId(course.id, 'b'.repeat(32), 1);

    expect((await db.courses.get(course.id))?.distribution).toEqual({
      ...distribution,
      shareId: 'b'.repeat(32),
      shareRevision: 1,
    });
  });

  it('rejects an unpublished course, a missing course and a malformed id', async () => {
    const course = await createCourse('Unpublished test');
    await expect(setCourseShareId(course.id, 'b'.repeat(32), 1)).rejects.toThrow(
      'not been published',
    );
    await expect(setCourseShareId('missing', 'b'.repeat(32), 1)).rejects.toThrow(
      'could not be found',
    );

    await publishCourse(course.id);
    await expect(setCourseShareId(course.id, 'short', 1)).rejects.toThrow(
      'share link code is invalid',
    );
  });

  it('keeps both a concurrent publish and the share id', async () => {
    // A share-ID write that spans a concurrent publish must not clobber the
    // committed revision: both writers run in same-table transactions, so
    // every interleaving below must converge on revision 2 with the id set.
    for (let round = 0; round < 10; round += 1) {
      const course = await createCourse(`Concurrent share ${round}`);
      await publishCourse(course.id);
      await Promise.all([publishCourse(course.id), setCourseShareId(course.id, 'b'.repeat(32), 2)]);
      const distribution = (await db.courses.get(course.id))?.distribution;
      expect(distribution?.revision).toBe(2);
      expect(distribution?.shareId).toBe('b'.repeat(32));
      expect(distribution?.shareRevision).toBe(2);
      await db.courses.delete(course.id);
    }
  });
});

describe('clearCourseShareId', () => {
  beforeEach(reset);

  it('clears the share id while keeping the lineage counter', async () => {
    const course = await createCourse('Clear share id test');
    await publishCourse(course.id);
    await setCourseShareId(course.id, 'c'.repeat(32), 1);

    await clearCourseShareId(course.id);

    expect((await db.courses.get(course.id))?.distribution).toEqual(
      expect.objectContaining({ revision: 1 }),
    );
    expect((await db.courses.get(course.id))?.distribution).not.toHaveProperty('shareId');
    expect((await db.courses.get(course.id))?.distribution).not.toHaveProperty('shareRevision');
  });

  it('is a no-op without a share id and rejects a missing course', async () => {
    const course = await createCourse('Nothing shared test');
    await publishCourse(course.id);
    await expect(clearCourseShareId(course.id)).resolves.toBeUndefined();
    await expect(clearCourseShareId('missing')).rejects.toThrow('could not be found');
  });
});

describe('detachCourse', () => {
  beforeEach(reset);

  it('clears distributedCopy, the lineage mapping and any pending review, leaving content untouched', async () => {
    const course = await createCourse('Detach test');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const lineageId = 'lineage-detach-1';
    await updateCourse(course.id, {
      distributedCopy: {
        lineageId,
        revision: 2,
        locked: true,
        autoAcceptUpdates: false,
      },
    });
    await db.lineageIdMappings.put({
      id: lineageId,
      courseId: course.id,
      lessonIds: [lesson.id],
      noteIds: [],
      cardIds: [],
      sequenceIds: [],
      lessonSnapshots: {},
      noteSnapshots: {},
      cardSnapshots: {},
    });
    await db.pendingMergeReviews.put({
      id: 'review-1',
      courseId: course.id,
      lineageId,
      revision: 2,
      diff: {
        creates: { lessons: [], notes: [], cards: [] },
        updates: { lessons: [], notes: [], cards: [] },
        removals: { lessonIds: [], noteIds: [], cardIds: [] },
        conflicts: [],
      },
      createdAt: Date.now(),
    });

    await detachCourse(course.id);

    const updated = await db.courses.get(course.id);
    expect(updated?.distributedCopy).toBeUndefined();
    expect(await db.lineageIdMappings.get(lineageId)).toBeUndefined();
    expect(await db.pendingMergeReviews.where('courseId').equals(course.id).toArray()).toEqual([]);
    // Lesson content itself is untouched by detach.
    expect(await db.lessons.get(lesson.id)).toBeDefined();
    // The severed lineage state leaves deletion receipts so a peer sync merge
    // cannot resurrect it (see mergeSnapshots' tombstone filter).
    expect(await db.tombstones.get(['lineageIdMappings', lineageId])).toMatchObject({
      table: 'lineageIdMappings',
      recordId: lineageId,
    });
    expect(await db.tombstones.get(['pendingMergeReviews', 'review-1'])).toMatchObject({
      table: 'pendingMergeReviews',
      recordId: 'review-1',
    });
  });

  it('is a no-op on lineage/review tables for a course with no distributedCopy', async () => {
    const course = await createCourse('Undistributed detach');
    await expect(detachCourse(course.id)).resolves.toBeUndefined();
    expect((await db.courses.get(course.id))?.distributedCopy).toBeUndefined();
  });

  it('rejects detaching a course that does not exist', async () => {
    await expect(detachCourse('missing')).rejects.toThrow('could not be found');
  });
});

describe('setCourseAutoAcceptUpdates', () => {
  beforeEach(reset);

  it('does not restore the shared-copy lock when detaching concurrently', async () => {
    const course = await createCourse('Concurrent auto-accept detach');
    await updateCourse(course.id, {
      distributedCopy: {
        lineageId: 'lineage-concurrent-detach',
        revision: 2,
        locked: true,
        autoAcceptUpdates: false,
      },
    });

    const results = await Promise.allSettled([
      setCourseAutoAcceptUpdates(course.id, true),
      detachCourse(course.id),
    ]);

    expect(results[1].status).toBe('fulfilled');
    expect((await db.courses.get(course.id))?.distributedCopy).toBeUndefined();
  });

  it('updates autoAcceptUpdates while leaving the rest of distributedCopy untouched', async () => {
    const course = await createCourse('Auto-accept test');
    await updateCourse(course.id, {
      distributedCopy: {
        lineageId: 'lineage-auto-1',
        revision: 2,
        locked: true,
        autoAcceptUpdates: false,
      },
    });

    await setCourseAutoAcceptUpdates(course.id, true);

    const updated = await db.courses.get(course.id);
    expect(updated?.distributedCopy).toEqual({
      lineageId: 'lineage-auto-1',
      revision: 2,
      locked: true,
      autoAcceptUpdates: true,
    });
  });

  it('rejects a course with no distributedCopy', async () => {
    const course = await createCourse('Undistributed auto-accept');
    await expect(setCourseAutoAcceptUpdates(course.id, true)).rejects.toThrow('not a shared copy');
  });

  it('rejects a course that does not exist', async () => {
    await expect(setCourseAutoAcceptUpdates('missing', true)).rejects.toThrow('could not be found');
  });
});
