import { createCourse } from '../../../src/db/courseRepository';
import { createLesson } from '../../../src/db/lessonRepository';
import { createCard } from '../../../src/db/cardRepository';
import { db } from '../../../src/db/schema';

/** Synthetic answers only: the browser tests intercept both hosted endpoints. */
export async function seed(enabled: boolean) {
  const course = await createCourse('Automatic marking check', {
    schedulingMode: 'steady',
    learnFirst: false,
  });
  const lesson = await createLesson(course.id, 'Light');
  const cardIds: string[] = [];
  for (let index = 0; index < 2; index++) {
    const card = await createCard(
      lesson.id,
      'front_back',
      `Name the three primary colours of light. (${index + 1})`,
      'Red, green and blue.',
      [],
      { answerMode: 'type' },
    );
    await db.lessonCardExposures.put({
      lessonId: lesson.id,
      cardId: card.id,
      taughtAt: Date.now(),
      updatedAt: Date.now(),
    });
    cardIds.push(card.id);
  }
  localStorage.setItem(
    'lacuna.jevSettings',
    JSON.stringify({ enabled, acceptedConsentVersion: 1 }),
  );
  localStorage.setItem('lacuna.aiHostedAccess', 'browser-test-only');
  return { lessonId: lesson.id, cardIds };
}
