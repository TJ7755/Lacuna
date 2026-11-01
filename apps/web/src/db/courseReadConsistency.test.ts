import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { db } from './schema';
import { createCourse } from './repository';
import { listCourses } from './read';

afterEach(() => vi.restoreAllMocks());

it('hydrates a consistent course snapshot when a deletion queues between table reads', async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  const course = await createCourse('Concurrent course');
  const readAssessments = db.courseAssessments.toArray.bind(db.courseAssessments);
  let deletion: Promise<unknown> | undefined;
  vi.spyOn(db.courseAssessments, 'toArray').mockImplementationOnce(() => {
    // A separate writer queues after the course read but before the assessment read.
    deletion = db.transaction('rw!', db.courses, db.courseAssessments, async () => {
      await db.courses.delete(course.id);
      await db.courseAssessments.where('courseId').equals(course.id).delete();
    });
    // Independent reads can observe a writer that commits before the next read.
    // A shared read transaction keeps that writer queued until its snapshot closes.
    return Dexie.currentTransaction
      ? readAssessments()
      : Dexie.Promise.resolve(deletion).then(() => readAssessments());
  });
  try {
    const courses = await listCourses();
    expect(courses.map((row) => row.id)).toContain(course.id);
  } finally {
    await deletion;
  }
  expect(await listCourses()).toEqual([]);
});
