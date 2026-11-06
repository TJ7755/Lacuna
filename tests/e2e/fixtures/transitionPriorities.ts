import { createCourse, createLesson, createLessonCard } from '../../../apps/web/src/db/repository';
import { db } from '../../../apps/web/src/db/schema';

const completedName =
  'How substances are transported through the circulatory system and exchanged across cell membranes';
const topicNames = [
  'Explain how differences in concentration cause substances to move across a selectively permeable cell membrane',
  'Explain how the movement of water across a selectively permeable cell membrane changes the mass of plant tissue',
];

/** Only authoring records: the browser completes the first lesson and creates its own evidence. */
export async function seed() {
  const course = await createCourse('Biology revision', {
    learnFirst: true,
    lessonViewMode: 'study',
  });
  const completed = await createLesson(course.id, completedName);
  const next = await createLesson(course.id, 'Membrane transport');
  await createLessonCard(
    course.id,
    completed.id,
    'front_back',
    'Name a transport tissue in a plant.',
    'Xylem',
    [],
    undefined,
    'reveal',
  );
  for (const name of topicNames) {
    const card = await createLessonCard(
      course.id,
      next.id,
      'front_back',
      'Explain membrane transport.',
      'Movement across a membrane.',
      [],
      undefined,
      'reveal',
    );
    await db.concepts.update(card.conceptId, { name });
  }
  return { courseId: course.id, completedName, topicNames };
}
