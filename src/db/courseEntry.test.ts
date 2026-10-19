import 'fake-indexeddb/auto';
import { setCourseStudyStartLesson } from './courseEntry';
import { beforeEach, expect, it } from 'vitest';
import { db } from './schema';
import { createCourse, updateCourse } from './courseRepository';
import { createLesson } from './lessonRepository';
import { exportDatabase, importBackup, validateBackup } from './portability';
import { buildCourseSharePayload } from './share';
import { importLineageFirstTime, mergeLineageUpdate } from './mergeImport';
import type { SharePayloadV5 } from './share';
import { mergeSnapshots } from '../sync/mergeSnapshots';
import { createOrResumeRevisionPlan } from './revisionPlanRepository';
import { createLessonCard } from './cardRepository';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('validates the entry point and changes only the local Course preference', async () => {
  const course = await createCourse('Science');
  const other = await createCourse('Other');
  const lesson = await createLesson(course.id, 'Year two');
  const extension = await createLesson(course.id, 'Extension', { isExtension: true });
  const foreign = await createLesson(other.id, 'Foreign');
  const before = await exportDatabase();
  for (const id of ['missing', extension.id, foreign.id]) {
    await expect(setCourseStudyStartLesson(course.id, id)).rejects.toThrow(/core lesson/);
  }
  await setCourseStudyStartLesson(course.id, lesson.id);
  const after = await exportDatabase();
  expect({ ...after, exportedAt: before.exportedAt, courses: before.courses }).toEqual(before);
  expect(after.courses?.find((row) => row.id === course.id)?.studyStartLessonId).toBe(lesson.id);
  await setCourseStudyStartLesson(course.id, undefined);
  expect((await db.courses.get(course.id))?.studyStartLessonId).toBeUndefined();
  await updateCourse(course.id, { archived: true });
  await expect(setCourseStudyStartLesson(course.id, lesson.id)).rejects.toThrow(/Restore/);
});

it('round-trips through backup and sync without publishing the entry preference', async () => {
  const course = await createCourse('Science');
  const lesson = await createLesson(course.id, 'Year two');
  const before = await exportDatabase();
  await setCourseStudyStartLesson(course.id, lesson.id);
  const backup = await exportDatabase();
  expect(validateBackup(backup)).toBe(true);
  expect(
    validateBackup({
      ...backup,
      courses: backup.courses?.map((row) => ({ ...row, studyStartLessonId: 42 })),
    }),
  ).toBe(false);
  expect(mergeSnapshots(before, backup).courses?.[0].studyStartLessonId).toBe(lesson.id);
  expect(JSON.stringify(await buildCourseSharePayload(course.id))).not.toContain(
    'studyStartLessonId',
  );
  await importBackup(backup, 'replace');
  db.close();
  await db.open();
  expect((await db.courses.get(course.id))?.studyStartLessonId).toBe(lesson.id);
});

it('retains the local entry point through locked publisher updates', async () => {
  const payload: SharePayloadV5 = {
    v: 5,
    by: 'Teacher',
    at: 1000,
    li: 'science',
    rv: 1,
    course: { n: 'Science', o: 0, c: 1000, sm: 1, um: 'semi-linear' },
    lessons: ['A', 'B'].map((id) => ({ i: id, n: id, notes: [], cards: [] })),
    exams: [{ id: 'final', n: 'Final', sm: 1, k: 'f', a: null, m: 'p', c: 1000 }],
    concepts: [],
    questions: [],
    questionSets: [],
    questionSetPracticeNodes: [],
  };
  const { course } = await importLineageFirstTime(payload);
  await setCourseStudyStartLesson(course.id, 'B');
  await mergeLineageUpdate(course.id, { ...payload, rv: 2, at: 2000 });
  expect((await db.courses.get(course.id))?.studyStartLessonId).toBe('B');
  expect((await db.courses.get(course.id))?.distributedCopy?.locked).toBe(true);
});

it('puts earlier unseen cards into the final exam revision schedule', async () => {
  const course = await createCourse('Science');
  const earlier = await createLesson(course.id, 'Year one');
  const current = await createLesson(course.id, 'Year two');
  const old = await createLessonCard(course.id, earlier.id, 'front_back', 'Known?', 'Yes');
  await createLessonCard(course.id, current.id, 'front_back', 'New?', 'No');
  await setCourseStudyStartLesson(course.id, current.id);
  const final = (await db.courseAssessments.where('courseId').equals(course.id).first())!;
  const plan = await createOrResumeRevisionPlan(final.id, 20, {
    projectionMode: 'fsrs-6-practice-fallback',
    memoryModelVersion: 'fsrs-6',
    fallbackReason: 'missing',
  });
  expect(plan.scope.coveredLessonIds).toEqual([earlier.id, current.id]);
  expect(plan.scope.eligibleCardIds).toEqual([old.id]);
  expect(plan.windows.length).toBeGreaterThan(0);
  expect(await db.lessonCardExposures.count()).toBe(0);
});
