import { lessonCardMembershipForLessons } from './lessonMembership';
import type { Card, Course, Lesson, LessonCardLink } from '@lacuna/core/db/types';
import type { ExamDateContext } from '../fsrs/examDate';
import { studyPool } from '../fsrs/eligibility';
import { earlierLessonIds } from './courseEntry';
import { eligiblePracticePool } from './studyPools';

/** Earlier knowledge enters real FSRS practice without fabricated teaching evidence. */
export function catchUpPracticePool(
  cards: Card[],
  course: Course,
  lessons: Lesson[],
  links: LessonCardLink[],
  examDateContext: ExamDateContext,
  reachedLessonIds: ReadonlySet<string>,
  now: number = Date.now(),
  priorKnowledgeLessonIds: ReadonlySet<string> = earlierLessonIds(
    course.studyStartLessonId,
    lessons,
    undefined,
    course.schoolCoveredLessonIds,
  ),
): Card[] {
  const earlier = new Set([...priorKnowledgeLessonIds].filter((id) => reachedLessonIds.has(id)));
  const scope = lessonCardMembershipForLessons(earlier, cards, links);
  return studyPool(
    eligiblePracticePool(scope, course, examDateContext, now),
    course,
    now,
    undefined,
    cards,
  );
}
