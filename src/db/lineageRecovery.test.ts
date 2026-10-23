import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { acceptMergeReviewItems, rejectMergeReviewItems, importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import type { SharePayloadV2 } from './share';
import { syncCourseSchedulingUnits } from './backingDecks';
import { createCourse, recordReview } from './repository';
import { exportDatabase, importBackup } from './portability';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

it.each([1, 164])('updates %i existing lessons after lineage bookkeeping is lost', async (count) => {
  const payload: SharePayloadV2 = {
    v: 2,
    by: 'Teacher',
    at: 1000,
    li: 'diagnostic-lineage',
    rv: 17,
    course: { n: 'Example course', o: 0, c: 1000, um: 'open' },
    lessons: Array.from({ length: count }, (_, index) => ({
      i: `diagnostic-lesson-${index}`,
      n: `Lesson ${index}`,
      notes: [],
      cards: [],
    })),
  };
  const { course } = await importLineageFirstTime(payload);
  await db.lineageIdMappings.delete(payload.li!);
  await expect(mergeLineageUpdate(course.id, { ...payload, rv: 22 })).resolves.toBeDefined();
  expect(await db.lessons.where('courseId').equals(course.id).count()).toBe(count);
  expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(22);
});

function contentPayload(): SharePayloadV2 {
  return {
    v: 2, by: 'Teacher', at: 1000, li: 'recovery-lineage', rv: 17,
    course: { n: 'Biology', o: 0, c: 1000, um: 'open' },
    lessons: [{ i: 'lesson', n: 'Cells', notes: [{ oi: 'note', n: 'Notes', c: 'Source notes' }],
      cards: [{ id: 'card', k: 0, f: 'Source question', b: 'Source answer' }] }],
  };
}

it.each(['intact', 'partial', 'snapshots-only', 'missing'] as const)(
  'keeps learner edits and evidence with %s membership', async (state) => {
    const payload = contentPayload();
    const { course } = await importLineageFirstTime(payload);
    const card = (await db.cards.get('card'))!;
    await recordReview({ card, eventId: 'recovery-review', sessionId: 'recovery-session',
      sessionKind: 'lesson', deck: course, kind: 'course', grade: 3, responseTimeSec: 2,
      distracted: false, correct: true, now: 1_725_123_456_789 });
    await db.lessons.update('lesson', { name: 'Learner lesson' });
    await db.notes.update('note', { content: 'Learner notes' });
    await db.cards.update('card', { front: 'Learner question' });
    await db.courses.update(course.id, { localLessonOrder: ['lesson'], newCardsPerDay: 7 });
    if (state === 'missing') await db.lineageIdMappings.delete(payload.li!);
    else if (state !== 'intact') {
      await db.lineageIdMappings.update(payload.li!, {
        lessonIds: [], noteIds: [], cardIds: state === 'partial' ? ['card'] : [],
      });
    }
    await syncCourseSchedulingUnits(course.id);
    const before = await exportDatabase();
    const result = await mergeLineageUpdate(course.id, { ...payload, rv: 22 });
    expect(result).toMatchObject({ createdLessons: 0, createdNotes: 0, createdCards: 0,
      conflictCount: 3, queuedForReview: true });
    const after = await exportDatabase();
    expect(after.cards).toEqual(before.cards);
    expect(after.notes).toEqual(before.notes);
    expect(after.lessons).toEqual(before.lessons);
    expect(after.reviewHistory).toEqual(before.reviewHistory);
    expect(after.schedulingUnits).toEqual(before.schedulingUnits);
    expect(after.coursePerformance).toEqual(before.coursePerformance);
    expect(after.schedulingPerformance).toEqual(before.schedulingPerformance);
    expect(after.courses![0]).toMatchObject({ localLessonOrder: ['lesson'], newCardsPerDay: 7 });
    const repaired = (await db.lineageIdMappings.get(payload.li!))!;
    expect(repaired.lessonIds).toContain('lesson');
    expect(repaired.lessonSnapshots).toEqual(before.lineageIdMappings?.[0]?.lessonSnapshots ?? {});
  },
);

it('uses retained snapshots to apply publisher changes without inventing a baseline', async () => {
  const payload = contentPayload();
  const { course } = await importLineageFirstTime(payload);
  await db.lineageIdMappings.update(payload.li!, { lessonIds: [], cardIds: [], noteIds: [] });
  const next = structuredClone(payload);
  next.rv = 22;
  next.lessons[0].n = 'Publisher lesson';
  next.lessons[0].cards[0].f = 'Publisher question';
  const result = await mergeLineageUpdate(course.id, next);
  expect(result.conflictCount).toBe(0);
  expect(await db.lessons.get('lesson')).toMatchObject({ name: 'Publisher lesson' });
  expect(await db.cards.get('card')).toMatchObject({ front: 'Publisher question' });
});

it('queues different publisher content when all old baselines are missing', async () => {
  const payload = contentPayload();
  const { course } = await importLineageFirstTime(payload);
  await db.lineageIdMappings.delete(payload.li!);
  const next = structuredClone(payload);
  next.rv = 22;
  next.lessons[0].n = 'Publisher lesson';
  next.lessons[0].cards[0].f = 'Publisher question';
  const result = await mergeLineageUpdate(course.id, next);
  expect(result.conflictCount).toBe(2);
  expect(await db.lessons.get('lesson')).toMatchObject({ name: 'Cells' });
  expect((await db.lineageIdMappings.get(payload.li!))!.lessonSnapshots).toEqual({});
});

it('retains unknown local rows and the saved manual review policy', async () => {
  const payload = contentPayload();
  const { course } = await importLineageFirstTime(payload);
  await db.lessons.add({ ...(await db.lessons.get('lesson'))!, id: 'local', name: 'Local lesson' });
  await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': false });
  await db.lineageIdMappings.update(payload.li!, { lessonIds: [] });
  const next = structuredClone(payload);
  next.rv = 22;
  next.lessons[0].n = 'Publisher lesson';
  expect((await mergeLineageUpdate(course.id, next)).queuedForReview).toBe(true);
  expect(await db.lessons.get('local')).toBeDefined();
  expect(await db.lessons.get('lesson')).toMatchObject({ name: 'Cells' });
  expect((await db.courses.get(course.id))?.distributedCopy?.autoAcceptUpdates).toBe(false);
});

it('updates after accepted backup replacement omitted lineage mappings', async () => {
  const payload = contentPayload();
  const { course } = await importLineageFirstTime(payload);
  const backup = await exportDatabase();
  delete backup.lineageIdMappings;
  await importBackup(backup, 'replace');
  expect((await mergeLineageUpdate(course.id, { ...payload, rv: 22 })).createdLessons).toBe(0);
  expect((await db.courses.get(course.id))?.distributedCopy?.revision).toBe(22);
});

it.each(['lesson', 'note', 'card', 'mapping'] as const)(
  'rejects foreign %s ownership atomically', async (kind) => {
    const payload = contentPayload();
    const { course } = await importLineageFirstTime(payload);
    const foreign = await createCourse('Other course');
    if (kind === 'mapping') await db.lineageIdMappings.update(payload.li!, { courseId: foreign.id });
    if (kind === 'lesson') await db.lessons.update('lesson', { courseId: foreign.id });
    if (kind === 'card') await db.cards.update('card', { courseId: foreign.id });
    if (kind === 'note') {
      await db.lessons.add({ ...(await db.lessons.get('lesson'))!, id: 'foreign-lesson', courseId: foreign.id });
      await db.notes.update('note', { lessonId: 'foreign-lesson' });
    }
    const before = await exportDatabase();
    await expect(mergeLineageUpdate(course.id, { ...payload, rv: 22 }))
      .rejects.toThrow(/integrity check failed.*[Ee]xport a backup/);
    const after = await exportDatabase();
    expect({ ...after, exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
  },
);


it.each([true, false])('resolves recovered conflicts explicitly (accept=%s)', async (accept) => {
  const payload = contentPayload();
  const { course } = await importLineageFirstTime(payload);
  await db.lineageIdMappings.delete(payload.li!);
  const next = structuredClone(payload);
  next.rv = 22;
  next.lessons[0].n = 'Publisher lesson';
  await mergeLineageUpdate(course.id, next);
  const review = (await db.pendingMergeReviews.toArray())[0];
  const resolve = accept ? acceptMergeReviewItems : rejectMergeReviewItems;
  await resolve(review.id, [{ kind: 'lesson', entityId: 'lesson' }]);
  expect((await db.lessons.get('lesson'))?.name).toBe(accept ? 'Publisher lesson' : 'Cells');
  expect(await db.pendingMergeReviews.get(review.id)).toBeUndefined();
});

it.each(['missing', 'wrong', 'foreign target'])(
  'retains pending decisions when review tracking is %s', async (damage) => {
    const payload = contentPayload();
    const { course } = await importLineageFirstTime(payload);
    await db.lineageIdMappings.delete(payload.li!);
    const next = structuredClone(payload);
    next.rv = 22;
    next.lessons[0].n = 'Publisher lesson';
    await mergeLineageUpdate(course.id, next);
    const review = (await db.pendingMergeReviews.toArray())[0];
    if (damage === 'missing') await db.lineageIdMappings.delete(payload.li!);
    else if (damage === 'wrong') await db.lineageIdMappings.update(payload.li!, { courseId: 'wrong' });
    else await db.lessons.update('lesson', { courseId: 'wrong' });
    const before = await exportDatabase();
    await expect(acceptMergeReviewItems(review.id, [{ kind: 'lesson', entityId: 'lesson' }]))
      .rejects.toThrow('integrity check failed');
    expect({ ...await exportDatabase(), exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
  },
);

it('rejects a foreign mapped removal target before applying unrelated publisher changes', async () => {
  const payload = contentPayload();
  const { course } = await importLineageFirstTime(payload);
  const foreign = await createCourse('Other course');
  await db.cards.update('card', { courseId: foreign.id });
  const before = await exportDatabase();
  await expect(mergeLineageUpdate(course.id, { ...payload, rv: 22, lessons: [] }))
    .rejects.toThrow('integrity check failed');
  expect({ ...await exportDatabase(), exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
});


it.each(['orphan note', 'generated card', 'other lineage'])(
  'rejects incompatible provenance: %s', async (damage) => {
    const payload = contentPayload();
    const { course } = await importLineageFirstTime(payload);
    if (damage === 'orphan note') await db.notes.update('note', { lessonId: 'absent' });
    if (damage === 'generated card') await db.cards.update('card', { sequenceItemId: 'generated' });
    if (damage === 'other lineage') {
      await db.lineageIdMappings.add({ ...(await db.lineageIdMappings.get(payload.li!))!, id: 'other-lineage' });
    }
    const before = await exportDatabase();
    await expect(mergeLineageUpdate(course.id, { ...payload, rv: 22 }))
      .rejects.toThrow('integrity check failed');
    expect({ ...await exportDatabase(), exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 });
  },
);

it('recovers retained membership for an upstream removal review', async () => {
  const payload = contentPayload();
  const { course } = await importLineageFirstTime(payload);
  await db.lineageIdMappings.update(payload.li!, { lessonIds: [], noteIds: [], cardIds: [] });
  await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': false });
  await mergeLineageUpdate(course.id, { ...payload, rv: 22, lessons: [] });
  expect((await db.pendingMergeReviews.toArray())[0].diff.removals)
    .toEqual({ lessonIds: ['lesson'], noteIds: ['note'], cardIds: ['card'] });
  expect(await db.lessons.get('lesson')).toBeDefined();
});
