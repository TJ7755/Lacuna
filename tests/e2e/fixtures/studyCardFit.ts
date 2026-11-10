import { createLessonCard } from '../../../apps/web/src/db/cardRepository';
import { createCourse } from '../../../apps/web/src/db/courseRepository';
import { createLesson } from '../../../apps/web/src/db/lessonRepository';

export async function seed() {
  const course = await createCourse('Card fit', { schedulingMode: 'steady' });
  const lesson = await createLesson(course.id, 'Lesson 1');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  return { card, lessonId: lesson.id };
}
