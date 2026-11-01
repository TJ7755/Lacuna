import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse, updateCourse } from './courseRepository';
import {
  createLesson,
  deleteLesson,
  reorderLessons,
  restoreLesson,
  snapshotLesson,
  updateLesson,
} from './lessonRepository';
import {
  buildCourseSharePayload,
  importSharePayload,
  parseSharePayload,
  type SharePayloadV6,
} from './share';
import {
  acceptAllMergeReview,
  acceptMergeReviewItems,
  detectStudentEdits,
  importLineageFirstTime,
  mergeLineageUpdate,
  rejectAllMergeReview,
} from './mergeImport';
import { exportDatabase, importBackup, validateBackup } from './portability';
import { createLessonCard } from './cardRepository';
import { recordReview } from './reviewRepository';
import { buildCourseFile, decodeCourseFile, withCourseFileAssets } from './courseFile';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { buildMergeReviewRows } from '../components/import/mergeReviewRows';
import { isLessonUnlocked } from '../course/path';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

function published(rv = 1): SharePayloadV6 {
  return {
    v: 6,
    concepts: [],
    questions: [],
    questionSets: [],
    questionSetPracticeNodes: [],
    by: 'Lacuna Biology Project',
    at: 1000 + rv,
    li: 'biology-source',
    rv,
    course: { n: 'Biology', o: 0, c: 1000, sm: 1, um: 'open' },
    lessons: [
      { i: 'cells', n: 'Animal cell structures', notes: [], cards: [] },
      { i: 'atp', n: 'ATP', pr: ['cells'], notes: [], cards: [] },
    ],
  };
}

async function fixture() {
  const course = await createCourse('Biology', {
    schedulingMode: 'steady',
    creator: 'Lacuna Biology Project',
  });
  const cells = await createLesson(course.id, 'Animal cell structures');
  const atp = await createLesson(course.id, 'ATP', { prerequisiteLessonIds: [cells.id] });
  return { course, cells, atp };
}

describe('advisory Lesson prerequisites and Course creator', () => {
  it('round-trips ordinary imports with fresh, coherent identities after reordering', async () => {
    const { course, cells, atp } = await fixture();
    const units = await db.schedulingUnits.toArray();
    await reorderLessons(course.id, [atp.id, cells.id]);
    expect((await db.lessons.get(atp.id))?.prerequisiteLessonIds).toEqual([cells.id]);
    expect(await db.schedulingUnits.toArray()).toEqual(units);
    const lessons = await db.lessons.toArray();
    expect(
      isLessonUnlocked(
        course,
        lessons.find((l) => l.id === atp.id)!,
        new Map(),
        lessons,
      ),
    ).toBe(true);
    const payload = parseSharePayload(await buildCourseSharePayload(course.id));
    expect(payload.by).toBe('Lacuna Biology Project');
    const result = await importSharePayload(payload);
    const imported = await db.lessons
      .where('courseId')
      .equals(result.courseIds[0])
      .sortBy('orderIndex');
    expect(imported.map((l) => l.name)).toEqual(['ATP', 'Animal cell structures']);
    expect(imported[0].id).not.toBe(atp.id);
    expect(imported[1].id).not.toBe(cells.id);
    expect(imported[0].prerequisiteLessonIds).toEqual([imported[1].id]);
    expect((await db.courses.get(result.courseIds[0]))?.creator).toBe(payload.by);
    expect((await buildCourseSharePayload(result.courseIds[0])).by).toBe(payload.by);
  });

  it('adopts lineage links, queues changes, preserves learner edits and tracks creator baselines', async () => {
    const { course } = await importLineageFirstTime(published());
    await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': false });
    expect((await db.lessons.get('atp'))?.prerequisiteLessonIds).toEqual(['cells']);
    expect(course.creator).toBe('Lacuna Biology Project');
    const next = published(2);
    next.by = 'Updated project';
    next.lessons[1].pr = [];
    await mergeLineageUpdate(course.id, next);
    expect((await db.courses.get(course.id))?.creator).toBe(next.by);
    expect((await db.courses.get(course.id))?.distributedCopy?.sourceLabel).toBe(next.by);
    expect((await db.lessons.get('atp'))?.prerequisiteLessonIds).toEqual(['cells']);
    const review = (await db.pendingMergeReviews.toArray())[0];
    expect(
      buildMergeReviewRows(review, await db.lessons.toArray()).updates[0].fields,
    ).toContainEqual(
      expect.objectContaining({
        label: 'Advisory prerequisites',
        before: 'Animal cell structures',
        after: '',
      }),
    );
    await acceptAllMergeReview(review.id);
    expect((await db.lessons.get('atp'))?.prerequisiteLessonIds).toEqual([]);
    await updateLesson('atp', { prerequisiteLessonIds: ['cells'] });
    await updateCourse(course.id, { creator: 'My local label' });
    const mapping = (await db.lineageIdMappings.get('biology-source'))!;
    expect(detectStudentEdits(mapping, await db.lessons.toArray(), [], []).has('atp')).toBe(true);
    const third = published(3);
    third.by = 'Another project';
    third.lessons[1].pr = [];
    await mergeLineageUpdate(course.id, third);
    const conflict = (await db.pendingMergeReviews.toArray())[0];
    expect(conflict.diff.conflicts.some((row) => row.entityId === 'atp')).toBe(true);
    await rejectAllMergeReview(conflict.id);
    expect((await db.lessons.get('atp'))?.prerequisiteLessonIds).toEqual(['cells']);
    expect((await db.courses.get(course.id))?.creator).toBe('My local label');
  });

  it('accepts a batch that reverses dependency direction without an intermediate cycle', async () => {
    const { course } = await importLineageFirstTime(published());
    await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': false });
    const next = published(2);
    next.lessons[0].pr = ['atp'];
    next.lessons[1].pr = [];
    await mergeLineageUpdate(course.id, next);
    const review = (await db.pendingMergeReviews.toArray())[0];
    await expect(
      acceptMergeReviewItems(review.id, [{ kind: 'lesson', entityId: 'cells' }]),
    ).rejects.toThrow(/cycl/i);
    expect((await db.lessons.get('cells'))?.prerequisiteLessonIds ?? []).toEqual([]);
    await acceptAllMergeReview(review.id);
    expect((await db.lessons.get('cells'))?.prerequisiteLessonIds).toEqual(['atp']);
    expect((await db.lessons.get('atp'))?.prerequisiteLessonIds).toEqual([]);
  });

  it('restores backup metadata and deletion undo without rewriting other Lesson edits', async () => {
    const { course, cells, atp } = await fixture();
    const backup = await exportDatabase();
    await importBackup(backup, 'replace');
    expect((await db.courses.get(course.id))?.creator).toBe(course.creator);
    expect((await db.lessons.get(atp.id))?.prerequisiteLessonIds).toEqual([cells.id]);
    const snapshot = (await snapshotLesson(cells.id))!;
    await deleteLesson(cells.id);
    expect((await db.lessons.get(atp.id))?.prerequisiteLessonIds).toEqual([]);
    await updateLesson(atp.id, { name: 'ATP revised locally' });
    await restoreLesson(snapshot);
    expect((await db.lessons.get(atp.id))?.prerequisiteLessonIds).toEqual([cells.id]);
    expect((await db.lessons.get(atp.id))?.name).toBe('ATP revised locally');
  });

  it('uses the Course-file codec and remaps an existing source id on every ordinary import', async () => {
    const { course } = await fixture();
    const file = await decodeCourseFile(await buildCourseFile(course.id));
    const first = await withCourseFileAssets(file, () => importSharePayload(file.payload));
    const second = await withCourseFileAssets(file, () => importSharePayload(file.payload));
    const copies = await Promise.all(
      [first, second].map(async ({ courseIds }) => {
        const lessons = await db.lessons
          .where('courseId')
          .equals(courseIds[0])
          .sortBy('orderIndex');
        expect(lessons[1].prerequisiteLessonIds).toEqual([lessons[0].id]);
        expect((await db.courses.get(courseIds[0]))?.creator).toBe(course.creator);
        return lessons[0].id;
      }),
    );
    expect(copies[0]).not.toBe(copies[1]);
  });

  it('preserves canonical learner evidence during an automatically applied prerequisite correction', async () => {
    const { course } = await importLineageFirstTime(published());
    const card = await createLessonCard(course.id, 'atp', 'front_back', 'ATP?', 'Energy transfer');
    await recordReview({
      card,
      eventId: 'advisory-review',
      sessionId: 'advisory-session',
      sessionKind: 'lesson',
      deck: course,
      kind: 'course',
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
      now: 1725123456789,
    });
    const before = await db.cards.get(card.id);
    const evidence = await db.reviewHistory.toArray();
    const stored = (await db.courses.get(course.id))!;
    await updateCourse(course.id, {
      distributedCopy: { ...stored.distributedCopy!, autoAcceptUpdates: true },
    });
    const next = published(2);
    delete next.lessons[1].pr;
    await mergeLineageUpdate(course.id, next);
    expect((await db.lessons.get('atp'))?.prerequisiteLessonIds).toEqual([]);
    expect(await db.cards.get(card.id)).toEqual(before);
    expect(await db.reviewHistory.toArray()).toEqual(evidence);
  });

  it('retains lineage snapshots and queued prerequisites through backup restore', async () => {
    const { course } = await importLineageFirstTime(published());
    await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': false });
    const next = published(2);
    next.lessons[1].pr = [];
    await mergeLineageUpdate(course.id, next);
    await importBackup(await exportDatabase(), 'replace');
    const mapping = (await db.lineageIdMappings.get('biology-source'))!;
    expect(detectStudentEdits(mapping, await db.lessons.toArray(), [], []).size).toBe(0);
    const review = (await db.pendingMergeReviews.toArray())[0];
    expect(review.diff.updates.lessons[0].prerequisiteLessonIds).toEqual([]);
    await acceptAllMergeReview(review.id);
    expect((await db.lessons.get('atp'))?.prerequisiteLessonIds).toEqual([]);
  });

  it('preserves links and creator under peer merge and refuses a combined cyclic graph', async () => {
    const { cells, atp } = await fixture();
    const original = await exportDatabase();
    const peer = structuredClone(original);
    const merged = mergeSnapshots(original, peer);
    expect(merged.courses![0].creator).toBe('Lacuna Biology Project');
    expect(merged.lessons!.find((l) => l.id === atp.id)?.prerequisiteLessonIds).toEqual([cells.id]);
    peer.lessons!.find((l) => l.id === atp.id)!.prerequisiteLessonIds = [];
    const target = peer.lessons!.find((l) => l.id === cells.id)!;
    target.prerequisiteLessonIds = [atp.id];
    target.updatedAt += 1000;
    original.lessons!.find((l) => l.id === atp.id)!.updatedAt += 1000;
    expect(validateBackup(peer)).toBe(true);
    expect(() => mergeSnapshots(original, peer)).toThrow(/cycl/i);
    // Manual Combine also validates the final selected rows, not just each valid input.
    target.createdAt += 1000;
    await expect(importBackup(peer, 'merge')).rejects.toThrow(/cycl/i);
    expect((await db.lessons.get(cells.id))?.prerequisiteLessonIds).toBeUndefined();
  });

  it('accepts legacy absence and retains a literal empty creator', async () => {
    const payload = published();
    delete payload.li;
    delete payload.rv;
    delete payload.lessons[1].pr;
    delete payload.lessons[0].i;
    delete payload.lessons[1].i;
    payload.by = null;
    const { courseIds } = await importSharePayload(parseSharePayload(payload));
    expect((await db.courses.get(courseIds[0]))?.creator).toBeUndefined();
    expect((await db.lessons.toArray()).every((l) => !l.prerequisiteLessonIds?.length)).toBe(true);
    await updateCourse(courseIds[0], { creator: '' });
    expect((await buildCourseSharePayload(courseIds[0])).by).toBe('');
    const backup = await exportDatabase();
    expect(validateBackup(backup)).toBe(true);
    await importBackup(backup, 'replace');
    expect((await db.courses.get(courseIds[0]))?.creator).toBe('');
  });

  it('keeps existing access rules independent of advisory links in every unlock mode', async () => {
    const { course, cells, atp } = await fixture();
    for (const unlockMode of ['open', 'linear', 'semi-linear'] as const) {
      for (const order of [
        [cells.id, atp.id],
        [atp.id, cells.id],
      ]) {
        await reorderLessons(course.id, order);
        const lessons = await db.lessons.where('courseId').equals(course.id).toArray();
        for (const lesson of lessons) {
          const withoutLinks = { ...lesson, prerequisiteLessonIds: [] };
          const dates = new Map([
            [cells.id, 100],
            [atp.id, 200],
          ]);
          expect(isLessonUnlocked({ ...course, unlockMode }, lesson, dates, lessons, 150)).toBe(
            isLessonUnlocked({ ...course, unlockMode }, withoutLinks, dates, lessons, 150),
          );
        }
      }
    }
  });

  it('rejects self, duplicate, missing, cross-Course and cyclic local references atomically', async () => {
    const { cells, atp } = await fixture();
    const foreign = await createLesson((await createCourse('Other')).id, 'Other');
    await expect(updateLesson(atp.id, { id: 'replacement' })).rejects.toThrow(/identity/i);
    await expect(updateLesson(atp.id, { courseId: foreign.courseId })).rejects.toThrow(
      /between Courses/i,
    );
    expect(await db.lessons.get(atp.id)).toEqual(atp);
    for (const ids of [[atp.id], [cells.id, cells.id], ['missing'], [foreign.id]]) {
      await expect(updateLesson(atp.id, { prerequisiteLessonIds: ids })).rejects.toThrow(
        /prerequisite/i,
      );
      expect((await db.lessons.get(atp.id))?.prerequisiteLessonIds).toEqual([cells.id]);
    }
    await expect(updateLesson(cells.id, { prerequisiteLessonIds: [atp.id] })).rejects.toThrow(
      /cycl/i,
    );
  });

  it.each(['missing', 'self', 'duplicate', 'cycle', 'duplicate-id'] as const)(
    'rejects %s shared references before writing',
    async (kind) => {
      const payload = published();
      if (kind === 'missing') payload.lessons[1].pr = ['absent'];
      if (kind === 'self') payload.lessons[1].pr = ['atp'];
      if (kind === 'duplicate') payload.lessons[1].pr = ['cells', 'cells'];
      if (kind === 'cycle') payload.lessons[0].pr = ['atp'];
      if (kind === 'duplicate-id') payload.lessons[1].i = 'cells';
      expect(() => parseSharePayload(payload)).toThrow();
      await expect(importSharePayload(payload)).rejects.toThrow();
      await expect(importLineageFirstTime(payload)).rejects.toThrow();
      expect(await db.courses.count()).toBe(0);
    },
  );

  it('rejects invalid backup graphs and creator/relationship shapes without replacing local data', async () => {
    const { course, atp } = await fixture();
    const backup = await exportDatabase();
    backup.lessons!.find((l) => l.id === atp.id)!.prerequisiteLessonIds = ['missing'];
    expect(validateBackup(backup)).toBe(false);
    await expect(importBackup(backup, 'replace')).rejects.toThrow(/prerequisite/i);
    expect(await db.courses.get(course.id)).toBeDefined();
    expect(validateBackup({ ...backup, courses: [{ ...backup.courses![0], creator: 12 }] })).toBe(
      false,
    );
  });
});
