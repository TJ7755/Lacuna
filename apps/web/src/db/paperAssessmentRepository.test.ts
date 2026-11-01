import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../specifications/paperFixture.testFixtures';
import { createCourse } from './courseRepository';
import { setCoursePaperAssessments } from './paperAssessmentRepository';
import { db } from './schema';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('sets up all papers atomically and retains the sole final assessment identity', async () => {
  const course = await createCourse('Science', {
    specificationData: paperSpecification,
    specificationRef: paperSpecificationReference,
  });
  const before = await db.courseAssessments.toArray();
  await expect(
    setCoursePaperAssessments(course.id, [
      { paperId: 'paper-1', examDate: 100 },
      { paperId: 'paper-2', examDate: Number.NaN },
    ]),
  ).rejects.toThrow(/finite/);
  expect(await db.courseAssessments.toArray()).toEqual(before);

  await setCoursePaperAssessments(course.id, [
    { paperId: 'paper-1', examDate: 100, timeZone: 'Europe/London' },
    { paperId: 'paper-2', examDate: 200, timeZone: 'Europe/London' },
  ]);
  const assessments = await db.courseAssessments.orderBy('examDate').toArray();
  expect(assessments).toMatchObject([
    { kind: 'checkpoint', specificationPaperId: 'paper-1', examDate: 100 },
    { id: before[0].id, kind: 'final', specificationPaperId: 'paper-2', examDate: 200 },
  ]);
  await expect(
    setCoursePaperAssessments(course.id, [
      { paperId: 'paper-1', examDate: 300 },
      { paperId: 'paper-2', examDate: 400 },
    ]),
  ).rejects.toThrow(/already configured/);
  expect(await db.courseAssessments.orderBy('examDate').toArray()).toEqual(assessments);
});
