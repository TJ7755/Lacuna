import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { hydrateCardsWithHistory } from '../db/reviewHistoryRead';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import type { Card, Course, CourseAssessment, CourseRecord, Lesson, Note } from '../db/types';

export interface SearchData {
  cards: Card[];
  courses: Course[];
  lessons: Lesson[];
  notes: Note[];
}

function hydrateCourses(records: CourseRecord[], assessments: CourseAssessment[]): Course[] {
  return records.map((record) =>
    hydrateCourse(record, finalAssessmentForCourse(record.id, assessments)),
  );
}

/**
 * All Course/Lesson entities needed by the global search surfaces.
 */
export function useSearchData(): SearchData | undefined {
  return useLiveQuery(async () => {
    const [cards, records, assessments, lessons, notes] = await Promise.all([
      db.cards.toArray(),
      db.courses.orderBy('createdAt').toArray(),
      db.courseAssessments.toArray(),
      db.lessons.orderBy('orderIndex').toArray(),
      db.notes.toArray(),
    ]);
    return {
      cards: await hydrateCardsWithHistory(cards),
      courses: hydrateCourses(records, assessments),
      lessons,
      notes,
    };
  }, []);
}
