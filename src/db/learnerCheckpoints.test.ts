import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { questionPayloadV5 } from './mergeImport.testFixtures';
import { acceptAllMergeReview, importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import {
  createCourseAssessment,
  deleteCourseAssessment,
  updateCourseAssessment,
} from './assessmentRepository';
import { setLocalLessonOrder } from './lessonOrder';
import { upsertLessonCardExposure } from './lessonRepository';

const ownOnly = { learnerOwnedOnly: true };
const examDate = 2_000_000_000_000;

function payload(revision = 1) {
  const base = questionPayloadV5();
  return questionPayloadV5({
    ...base,
    rv: revision,
    at: revision * 1000,
    lessons: [
      ...base.lessons.map((lesson) => ({
        ...lesson,
        n: revision === 1 ? lesson.n : 'Publisher correction',
      })),
      { i: 'second-lesson', n: 'Second lesson', notes: [], cards: [] },
    ],
    exams: [
      { id: 'publisher-final', n: 'Final', k: 'f', a: null, m: 'p', e: examDate, c: 1000 },
      { id: 'publisher-test', n: 'Teacher test', k: 'c', a: 0, m: 'p', e: examDate, c: 1000 },
    ],
  });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('rejects published checkpoints and stale permissions after archive or missing tracking', async () => {
  const { course } = await importLineageFirstTime(payload());
  const own = await createCourseAssessment(course.id, 'My mock', examDate);
  const originalMapping = (await db.lineageIdMappings.get('lineage-questions'))!;
  const assessmentBefore = await db.courseAssessments.toArray();
  for (const reason of [
    'published-id',
    'published-snapshot',
    'archived',
    'missing-tracking',
  ] as const) {
    await db.lineageIdMappings.put(originalMapping);
    await db.courses.update(course.id, { archived: false });
    if (reason === 'published-snapshot')
      await db.lineageIdMappings.update(originalMapping.id, {
        assessmentIds: originalMapping.assessmentIds!.filter((id) => id !== 'publisher-test'),
      });
    if (reason === 'archived') await db.courses.update(course.id, { archived: true });
    if (reason === 'missing-tracking') await db.lineageIdMappings.delete(originalMapping.id);
    const targetId =
      reason === 'published-id' || reason === 'published-snapshot' ? 'publisher-test' : own.id;
    await expect(updateCourseAssessment(targetId, { name: 'Stale edit' }, ownOnly)).rejects.toThrow(
      /own checkpoints/,
    );
    await expect(deleteCourseAssessment(targetId, ownOnly)).rejects.toThrow(/own checkpoints/);
    expect(await db.courseAssessments.toArray()).toEqual(assessmentBefore);
  }
});

it('validates learner custom coverage against the local lesson order', async () => {
  const { course } = await importLineageFirstTime(payload());
  await setLocalLessonOrder(course.id, ['second-lesson', 'lesson-questions']);
  const own = await createCourseAssessment(course.id, 'My custom test', examDate, {
    afterLessonId: 'lesson-questions',
    coverageMode: 'custom',
    lessonIds: ['second-lesson'],
  });
  await updateCourseAssessment(own.id, { name: 'Renamed custom test' }, ownOnly);
  expect(await db.courseAssessments.get(own.id)).toMatchObject({
    name: 'Renamed custom test',
    afterLessonId: 'lesson-questions',
    lessonIds: ['second-lesson'],
  });
});

it.each([false, true])(
  'retains own checkpoint edits and deletion through published updates (automatic %s)',
  async (automatic) => {
    const source = payload();
    const { course } = await importLineageFirstTime(source);
    await db.courses.update(course.id, { 'distributedCopy.autoAcceptUpdates': automatic });
    await setLocalLessonOrder(course.id, ['second-lesson', 'lesson-questions']);
    const own = await createCourseAssessment(course.id, 'My mock', examDate);
    expect(own.afterLessonId).toBe('lesson-questions');
    await updateCourseAssessment(
      own.id,
      {
        name: 'School topic test',
        examDate: examDate + 86400000,
        timeZone: 'Europe/London',
        afterLessonId: 'second-lesson',
        coverageMode: 'custom',
        lessonIds: ['lesson-questions'],
      },
      ownOnly,
    );
    const saved = (await db.courseAssessments.get(own.id))!;
    await upsertLessonCardExposure('lesson-questions', 'card-quadratic-definition');
    const cards = await db.cards.toArray();
    const exposures = await db.lessonCardExposures.toArray();
    const lessons = await db.lessons.toArray();
    await mergeLineageUpdate(course.id, payload(2));
    if (!automatic) {
      const review = await db.pendingMergeReviews.where('courseId').equals(course.id).first();
      if (review) await acceptAllMergeReview(review.id);
    }
    expect(await db.courseAssessments.get(own.id)).toEqual(saved);
    expect((await db.lineageIdMappings.get(source.li!))?.assessmentIds).not.toContain(own.id);
    expect(
      (await db.lineageIdMappings.get(source.li!))?.assessmentSnapshots?.[own.id],
    ).toBeUndefined();
    expect((await db.lessons.get('lesson-questions'))?.name).toBe('Publisher correction');
    expect((await db.lessons.toArray()).map(({ id, orderIndex }) => ({ id, orderIndex }))).toEqual(
      lessons.map(({ id, orderIndex }) => ({ id, orderIndex })),
    );
    expect(await db.cards.toArray()).toEqual(cards);
    expect(await db.lessonCardExposures.toArray()).toEqual(exposures);
    await expect(
      updateCourseAssessment('publisher-test', { name: 'Changed' }, ownOnly),
    ).rejects.toThrow(/own checkpoints/);
    await expect(deleteCourseAssessment('publisher-test', ownOnly)).rejects.toThrow(
      /own checkpoints/,
    );
    await deleteCourseAssessment(own.id, ownOnly);
    await mergeLineageUpdate(course.id, payload(3));
    expect(await db.courseAssessments.get(own.id)).toBeUndefined();
    expect(await db.tombstones.get(['courseAssessments', own.id])).toBeDefined();
  },
);
