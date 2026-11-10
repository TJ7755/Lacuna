import { createLessonCard } from '../../../apps/web/src/db/cardRepository';
import { createCourse } from '../../../apps/web/src/db/courseRepository';
import { createLesson } from '../../../apps/web/src/db/lessonRepository';

export async function seed(courseName: string, content: readonly (readonly [string, string])[]) {
  const course = await createCourse(courseName, { schedulingMode: 'steady' });
  const lesson = await createLesson(course.id, 'Lesson 1');
  const cards = [];
  for (const [front, back] of content)
    cards.push(await createLessonCard(course.id, lesson.id, 'front_back', front, back));
  return { courseId: course.id, lessonId: lesson.id, cards };
}
