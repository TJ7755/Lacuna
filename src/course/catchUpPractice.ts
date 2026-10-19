import type { Card, Course, Lesson, LessonCardLink } from '../db/types';
import type { ExamDateContext } from '../fsrs/examDate';
import { studyPool } from '../fsrs/eligibility';
import { earlierLessonIds } from './courseEntry';
import { eligiblePracticePool, lessonCardMembershipForLessons } from './studyPools';

/** Earlier knowledge enters real FSRS practice without fabricated teaching evidence. */
export function catchUpPracticePool(
  cards: Card[],
  course: Course,
  lessons: Lesson[],
  links: LessonCardLink[],
  examDateContext: ExamDateContext,
  reachedLessonIds: ReadonlySet<string>,
  now: number = Date.now(),
): Card[] {
  const earlier = new Set(
    [...earlierLessonIds(course.studyStartLessonId, lessons)].filter((id) =>
      reachedLessonIds.has(id),
    ),
  );
  const scope = lessonCardMembershipForLessons(earlier, cards, links);
  return studyPool(
    eligiblePracticePool(scope, course, examDateContext, now),
    course,
    now,
    undefined,
    cards,
  );
}
