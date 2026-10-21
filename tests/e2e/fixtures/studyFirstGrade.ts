import { seed as seedHeavy } from '../../../scripts/performance-heavy/fixture';
import { db } from '../../../src/db/schema';

export async function seed() {
  await seedHeavy(true);
  await db.open();
  const lessonId = 'heavy-lesson-0-0';
  const cards = await db.cards.where('primaryLessonId').equals(lessonId).toArray();
  await db.cards.bulkDelete(cards.slice(13).map((card) => card.id));
  await db.cards.bulkPut(
    cards
      .slice(0, 13)
      .map((card) => ({
        ...card,
        stability: null,
        difficulty: null,
        lastReviewed: null,
        reps: 0,
        lapses: 0,
        state: 0 as const,
        due: null,
        scheduledDays: 0,
        learningSteps: 0,
      })),
  );
  await db.reviewHistory
    .where('cardId')
    .anyOf(cards.map((card) => card.id))
    .delete();
  await db.lessonCardExposures.where('lessonId').equals(lessonId).delete();
  await db.courses.update('heavy-course-0', { learnFirst: true });
  db.close();
}
