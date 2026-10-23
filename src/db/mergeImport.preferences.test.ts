import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import type { SharePayloadV2 } from './share';
import { findCourseForLineage, importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import { detachCourse, setCourseAutoAcceptUpdates } from './courseRepository';
import { exportDatabase, importBackup } from './portability';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { manualMerge } from '../sync/manualMerge';
import { recordReview } from './repository';

function payload(revision = 1): SharePayloadV2 {
  return {
    v: 2, by: 'Teacher', at: revision * 1000, li: 'preferences-lineage', rv: revision,
    course: { n: 'Biology', o: 0, c: 1000, um: 'open' },
    lessons: [{
      i: 'preferences-lesson', n: revision === 1 ? 'Cells' : 'Cells revised',
      notes: [{ oi: 'preferences-note', n: 'Intro', c: `Teacher notes ${revision}` }],
      cards: [{ id: 'preferences-card', k: 0, f: 'Question', b: `Answer ${revision}` }],
    }],
  };
}

describe('shared-course update preference', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('enables automatic updates on first import and applies non-conflicting content', async () => {
    const { course } = await importLineageFirstTime(payload());
    expect(course.distributedCopy?.autoAcceptUpdates).toBe(true);
    expect((await db.courses.get(course.id))?.distributedCopy?.autoAcceptUpdates).toBe(true);

    const result = await mergeLineageUpdate(course.id, payload(2));
    expect(result).toMatchObject({ appliedUpdates: 3, queuedForReview: false, conflictCount: 0 });
    expect((await db.lessons.get('preferences-lesson'))?.name).toBe('Cells revised');
    expect((await db.cards.get('preferences-card'))?.back).toBe('Answer 2');
    expect(await db.pendingMergeReviews.count()).toBe(0);
  });

  it('keeps local edits in review while applying other updates with the new default', async () => {
    const { course } = await importLineageFirstTime(payload());
    await db.notes.update('preferences-note', { content: 'My own notes' });
    const card = (await db.cards.get('preferences-card'))!;
    await recordReview({
      card, deck: course, kind: 'course', grade: 3, responseTimeSec: 2,
      distracted: false, correct: true, now: 1_725_123_456_789,
      eventId: 'preferences-review', sessionId: 'preferences-session', sessionKind: 'lesson',
    });
    const reviewed = (await db.cards.get(card.id))!;
    const history = await db.reviewHistory.toArray();
    const result = await mergeLineageUpdate(course.id, payload(2));

    expect(result).toMatchObject({ appliedUpdates: 2, conflictCount: 1, queuedForReview: true });
    expect((await db.notes.get('preferences-note'))?.content).toBe('My own notes');
    const updated = (await db.cards.get(card.id))!;
    expect(updated.back).toBe('Answer 2');
    expect(updated.reps).toBe(reviewed.reps);
    expect(updated.lastReviewed).toBe(reviewed.lastReviewed);
    expect(await db.reviewHistory.toArray()).toEqual(history);
    expect((await db.pendingMergeReviews.where('courseId').equals(course.id).first())?.diff.conflicts)
      .toMatchObject([{ entityId: 'preferences-note', kind: 'note' }]);
  });

  it.each([false, true])('preserves saved %s across reopen, re-import, backup and sync', async (preference) => {
    const { course } = await importLineageFirstTime(payload());
    await setCourseAutoAcceptUpdates(course.id, preference);
    db.close();
    await db.open();
    const existing = await findCourseForLineage('preferences-lineage');
    expect(existing?.id).toBe(course.id);
    expect(existing?.distributedCopy?.autoAcceptUpdates).toBe(preference);
    const result = await mergeLineageUpdate(course.id, payload(2));
    expect(result.queuedForReview).toBe(!preference);
    expect((await db.courses.get(course.id))?.distributedCopy?.autoAcceptUpdates).toBe(preference);
    expect((await db.cards.get('preferences-card'))?.back).toBe(preference ? 'Answer 2' : 'Answer 1');

    const backup = await exportDatabase();
    await importBackup(backup, 'replace');
    expect((await db.courses.get(course.id))?.distributedCopy?.autoAcceptUpdates).toBe(preference);
    const merged = mergeSnapshots(backup, await exportDatabase());
    expect(merged.courses.find((row) => row.id === course.id)?.distributedCopy?.autoAcceptUpdates)
      .toBe(preference);
    await manualMerge(backup, { kind: 'peer' });
    expect((await db.courses.get(course.id))?.distributedCopy?.autoAcceptUpdates).toBe(preference);
  });

  it('does not attach an automatic-update preference to a detached plain copy', async () => {
    const { course } = await importLineageFirstTime(payload());
    await detachCourse(course.id);
    expect((await db.courses.get(course.id))?.distributedCopy).toBeUndefined();
    const copy = await importLineageFirstTime(payload());
    expect(copy.course.distributedCopy).toBeUndefined();
    expect((await db.courses.get(course.id))?.distributedCopy).toBeUndefined();
  });
});
