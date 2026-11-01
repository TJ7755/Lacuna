import { createCourse } from '../../../apps/web/src/db/courseRepository';
import { createLesson } from '../../../apps/web/src/db/lessonRepository';
import { createCard } from '../../../apps/web/src/db/cardRepository';
import { db } from '../../../apps/web/src/db/schema';

/** Synthetic answers only: the browser tests intercept both hosted endpoints. */
export async function seed(enabled: boolean, globalTyping = false) {
  const course = await createCourse('Automatic marking check', {
    schedulingMode: 'steady',
    learnFirst: false,
  });
  const lesson = await createLesson(course.id, 'Light', { answerMode: 'reveal' });
  const cardIds: string[] = [];
  for (let index = 0; index < 2; index++) {
    const card = await createCard(
      lesson.id,
      'front_back',
      `Name the three primary colours of light. (${index + 1})`,
      'Red, green and blue.',
      [],
      globalTyping ? {} : { answerMode: 'type' },
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
    JSON.stringify({ enabled, acceptedConsentVersion: 2 }),
  );
  if (globalTyping) localStorage.setItem('lacuna.answerInput', 'type');
  localStorage.setItem('lacuna.jevInstallation', 'a'.repeat(64));
  return { lessonId: lesson.id, cardIds };
}
