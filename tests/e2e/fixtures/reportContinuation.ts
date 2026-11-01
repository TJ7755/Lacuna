import { createCourse, createLesson, createLessonCard } from '../../../src/db/repository';
import { db } from '../../../src/db/schema';

export async function seed(automatic: boolean) {
  localStorage.setItem(
    'lacuna.jevSettings',
    JSON.stringify({ enabled: automatic, acceptedConsentVersion: 2 }),
  );
  localStorage.setItem('lacuna.jevInstallation', 'a'.repeat(64));
  const course = await createCourse('Report continuation', { learnFirst: false });
  const lesson = await createLesson(course.id, 'Due material');
  const card = await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    'Name a colour',
    'Red',
    [],
    undefined,
    automatic ? 'type' : 'reveal',
  );
  await db.cards.update(card.id, {
    state: 2,
    stability: 0.1,
    difficulty: 5,
    reps: 5,
    lastReviewed: Date.now() - 86_400_000,
    due: Date.now() - 1,
  });
  return course.id;
}
