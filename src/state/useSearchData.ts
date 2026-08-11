import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import type { Card, Course, CourseAssessment, CourseRecord, Deck, Lesson, Note } from '../db/types';

export interface SearchData {
  cards: Card[];
  decks: Deck[];
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
 * All entities needed by the global search surfaces. The legacy deck read is kept
 * inside this compatibility boundary so Course/Lesson UI does not discover hidden
 * backing decks or depend on their shape.
 */
export function useSearchData(): SearchData | undefined {
  return useLiveQuery(async () => {
    const [cards, decks, records, assessments, lessons, notes] = await Promise.all([
      db.cards.toArray(),
      db.decks.orderBy('createdAt').toArray(),
      db.courses.orderBy('createdAt').toArray(),
      db.courseAssessments.toArray(),
      db.lessons.orderBy('orderIndex').toArray(),
      db.notes.toArray(),
    ]);
    return {
      cards,
      decks,
      courses: hydrateCourses(records, assessments),
      lessons,
      notes,
    };
  }, []);
}
