import { createCard, suspendCard } from '../../../apps/web/src/db/cardRepository';
import { createCourse } from '../../../apps/web/src/db/courseRepository';
import { createLesson } from '../../../apps/web/src/db/lessonRepository';
import { db } from '../../../apps/web/src/db/schema';

const fruit = {
  apple: 'pomme',
  pear: 'poire',
  cherry: 'cerise',
  peach: 'pêche',
  plum: 'prune',
  apricot: 'abricot',
  strawberry: 'fraise',
  raspberry: 'framboise',
  lemon: 'citron',
  grape: 'raisin',
  watermelon: 'pastèque',
  pineapple: 'ananas',
};

export async function seed(
  cards = Object.fromEntries(
    Object.entries(fruit).map(([term, answer]) => [`What is the French for ${term}?`, answer]),
  ),
  lessonName = 'Fruit',
  suspendedPrompt?: string,
) {
  const course = await createCourse('French vocabulary', {
    schedulingMode: 'steady',
    learnFirst: true,
  });
  const lesson = await createLesson(course.id, lessonName, { answerMode: 'reveal' });
  for (const [prompt, answer] of Object.entries(cards)) {
    const card = await createCard(lesson.id, 'front_back', prompt, answer);
    if (prompt === suspendedPrompt) await suspendCard(card.id);
  }
  return { courseId: course.id, lessonId: lesson.id, cards };
}

export async function reviews() {
  return (await db.reviewHistory.toArray()).map(({ grade, input, responseTimeSec }) => ({
    grade,
    input,
    responseTimeSec,
  }));
}
