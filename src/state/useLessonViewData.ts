import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { Card, Course, CourseAssessment, Lesson } from '../db/types';
import {
  useCourse,
  useCourseAssessments,
  useLessonBackingDeck,
  useLessonCards,
  useLessons,
  useNotes,
} from './useCourseData';
import { useCourseStudyFlow } from './useCourseStudyFlow';

/** The inline lesson consumes the same ready snapshot as its course path. */
export interface InlineLessonData {
  course: Course;
  lesson: Lesson;
  lessons: Lesson[];
  examDates: CourseAssessment[];
  lessonCards: Card[];
  dueReviewCardIds: ReadonlySet<string>;
}

export function useLessonViewData(
  courseId: string | undefined,
  lessonId: string | undefined,
  inlineData?: InlineLessonData,
) {
  // Keep subscriptions in hook order, but do not repeat the parent's database reads.
  const queriedCourseId = inlineData ? undefined : courseId;
  const queriedLessonId = inlineData ? undefined : lessonId;
  const queriedLesson = useLiveQuery<Lesson | null>(
    () =>
      queriedLessonId ? db.lessons.get(queriedLessonId).then((lesson) => lesson ?? null) : null,
    [queriedLessonId],
  );
  const queriedCourse = useCourse(queriedCourseId);
  const queriedLessons = useLessons(queriedCourseId);
  const queriedExamDates = useCourseAssessments(queriedCourseId);
  const queriedCards = useLessonCards(queriedLessonId);
  const studyFlow = useCourseStudyFlow(queriedCourseId);
  const notes = useNotes(lessonId);
  // Scheduling configuration and related question sets can resolve after the workspace.
  const lessonDeck = useLessonBackingDeck(courseId, lessonId);

  return {
    lesson: inlineData?.lesson ?? queriedLesson,
    course: inlineData?.course ?? queriedCourse,
    lessons: inlineData?.lessons ?? queriedLessons,
    examDates: inlineData?.examDates ?? queriedExamDates,
    lessonCards: inlineData?.lessonCards ?? queriedCards,
    dueReviewCardIds: inlineData?.dueReviewCardIds ?? studyFlow?.snapshot.dueReviewCardIds,
    studyReady: inlineData !== undefined || studyFlow !== undefined,
    notes,
    lessonDeck,
  };
}
