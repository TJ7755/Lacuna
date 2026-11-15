import { db } from './schema';
import { canEditLessons } from '../course/lessonViewMode';

/** Check destination authority inside the transaction that writes imported cards. */
export async function requireEditableImportCourse(courseId: string) {
  const course = await db.courses.get(courseId);
  if (!course) throw new Error('Import course no longer exists.');
  if (!canEditLessons(course)) throw new Error('This published course is locked.');
  return course;
}

export async function requireEditableImportUnit(unitId: string) {
  const unit = await db.schedulingUnits.get(unitId);
  if (!unit?.courseId) throw new Error('Import destination no longer exists.');
  await requireEditableImportCourse(unit.courseId);
  if (unit.lessonId) {
    const lesson = await db.lessons.get(unit.lessonId);
    if (!lesson || lesson.courseId !== unit.courseId) {
      throw new Error('Import lesson no longer belongs to this course.');
    }
  }
  return unit;
}
