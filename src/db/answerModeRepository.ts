import { isLessonAuthoringMode } from '../course/lessonViewMode';
import { isTypingEligible } from '../utils/answerMode';
import { stampUpdatedAt } from './mutationStamp';
import { db } from './schema';
import type { AnswerMode } from './types';

/** Update authored answer modes together, without touching review history. */
export async function setAuthoredAnswerMode(
  courseId: string,
  target: { lessonId: string } | { cardIds: string[] },
  answerMode: AnswerMode | undefined,
): Promise<void> {
  await db.transaction('rw', [db.courses, db.lessons, db.cards], async () => {
    const course = await db.courses.get(courseId);
    if (!course || course.archived || !isLessonAuthoringMode(course)) {
      throw new Error('Switch to Author mode to change how cards are answered.');
    }
    if (answerMode !== undefined && answerMode !== 'reveal' && answerMode !== 'type') {
      throw new Error('Choose Reveal or Type.');
    }
    if ('lessonId' in target) {
      const lesson = await db.lessons.get(target.lessonId);
      if (!lesson || lesson.courseId !== courseId) throw new Error('Lesson not found.');
      await db.lessons.update(lesson.id, stampUpdatedAt({ answerMode }));
      return;
    }
    const cards = await db.cards.bulkGet(target.cardIds);
    if (
      cards.some(
        (card) =>
          !card ||
          card.courseId !== courseId ||
          card.sequenceItemId ||
          card.occlusionRegionId ||
          !isTypingEligible(card),
      )
    ) {
      throw new Error('Choose ordinary text cards to change their answer mode.');
    }
    await db.cards.where('id').anyOf(target.cardIds).modify(stampUpdatedAt({ answerMode }));
  });
}
