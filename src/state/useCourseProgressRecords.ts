import { useLiveQuery } from 'dexie-react-hooks';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import { hydrateCardsWithHistory } from '../db/reviewHistoryRead';
import { db } from '../db/schema';
import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
} from '../db/types';
import type { Concept } from '../questions/types';

/** The records behind the Progress report, without the Path's practice and question data. */
export interface CourseProgressRecords {
  course: Course | null;
  lessons: Lesson[];
  cards: Card[];
  assessments: CourseAssessment[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  concepts: Concept[];
}

const missing: CourseProgressRecords = {
  course: null,
  lessons: [],
  cards: [],
  assessments: [],
  links: [],
  exposures: [],
  concepts: [],
};

async function readCourseProgressRecords(
  courseId: string | undefined,
): Promise<CourseProgressRecords> {
  if (!courseId) return missing;
  const [courseRecord, assessments] = await db.transaction(
    'r',
    [db.courses, db.courseAssessments],
    () =>
      Promise.all([
        db.courses.get(courseId),
        db.courseAssessments.where('courseId').equals(courseId).toArray(),
      ]),
  );
  if (!courseRecord) return missing;
  const [lessons, rawCards, concepts] = await Promise.all([
    db.lessons.where('courseId').equals(courseId).sortBy('orderIndex'),
    db.cards.where('courseId').equals(courseId).toArray(),
    db.concepts.where('courseId').equals(courseId).toArray(),
  ]);
  const lessonIds = lessons.map((lesson) => lesson.id);
  const [cards, links, exposures] = await Promise.all([
    hydrateCardsWithHistory(rawCards),
    lessonIds.length > 0 ? db.lessonCards.where('lessonId').anyOf(lessonIds).toArray() : [],
    lessonIds.length > 0 ? db.lessonCardExposures.where('lessonId').anyOf(lessonIds).toArray() : [],
  ]);
  return {
    course: hydrateCourse(courseRecord, finalAssessmentForCourse(courseId, assessments)),
    lessons,
    cards,
    assessments,
    links,
    exposures,
    concepts,
  };
}

export function useCourseProgressRecords(
  courseId: string | undefined,
): CourseProgressRecords | undefined {
  return useLiveQuery(() => readCourseProgressRecords(courseId), [courseId]);
}
