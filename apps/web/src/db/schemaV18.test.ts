import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse } from './repository';

describe('classroom distribution storage', () => {
  beforeEach(async () => {
    await db.delete();
  });

  it('creates new courses with no distribution fields by default', async () => {
    await db.open();
    const course = await createCourse('Chemistry');
    expect(course.distributedCopy).toBeUndefined();
    expect(course.distribution).toBeUndefined();
  });

  it('creates empty lineage tables on a fresh install', async () => {
    await db.open();
    expect(await db.lineageIdMappings.count()).toBe(0);
    expect(await db.pendingMergeReviews.count()).toBe(0);
  });

  it('reads and writes lineageIdMappings and pendingMergeReviews rows', async () => {
    await db.open();
    const course = await createCourse('History');

    await db.lineageIdMappings.add({
      id: 'lineage-1',
      courseId: course.id,
      lessonIds: ['l1'],
      noteIds: [],
      cardIds: ['c1'],
      sequenceIds: [],
      lessonSnapshots: {},
      noteSnapshots: {},
      cardSnapshots: {},
    });
    await db.pendingMergeReviews.add({
      id: 'review-1',
      courseId: course.id,
      lineageId: 'lineage-1',
      revision: 2,
      diff: {
        creates: { lessons: [], notes: [], cards: [] },
        updates: { lessons: [], notes: [], cards: [] },
        removals: { lessonIds: [], noteIds: [], cardIds: [] },
        conflicts: [],
      },
      createdAt: 500,
    });

    expect(await db.lineageIdMappings.get('lineage-1')).toMatchObject({ courseId: course.id });
    expect(await db.pendingMergeReviews.where('courseId').equals(course.id).count()).toBe(1);
  });
});
