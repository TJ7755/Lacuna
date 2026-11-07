import { createCard } from '../../../apps/web/src/db/cardRepository';
import { createCourse } from '../../../apps/web/src/db/courseRepository';
import { createLesson } from '../../../apps/web/src/db/lessonRepository';
import { db } from '../../../apps/web/src/db/schema';

export async function seed(cards: Record<string, string>) {
  const course = await createCourse('French vocabulary', {
    schedulingMode: 'steady',
    learnFirst: false,
  });
  const lesson = await createLesson(course.id, 'Fruit', { answerMode: 'reveal' });
  for (const [prompt, answer] of [
    ...Object.entries(cards),
    ['An ambiguous prompt?', 'First possible answer'],
    ['An ambiguous prompt?', 'Second possible answer'],
    ['A card with multiple paragraphs?', 'First paragraph.\n\nSecond paragraph.'],
  ]) {
    await createCard(lesson.id, 'front_back', prompt, answer);
  }
  const otherLesson = await createLesson(course.id, 'Transport');
  await createCard(otherLesson.id, 'front_back', 'What is the French for train?', 'train');
  return { courseId: course.id, lessonId: lesson.id };
}

export function countReviews() {
  return db.reviewHistory.count();
}
