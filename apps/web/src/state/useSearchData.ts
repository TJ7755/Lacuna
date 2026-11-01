import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import type { Card, Course, CourseAssessment, CourseRecord, Lesson, Note } from '../db/types';
import type { QuestionDefinition } from '../questions/types';

export interface SearchData {
  cards: Card[];
  courses: Course[];
  lessons: Lesson[];
  notes: Note[];
  questions: QuestionDefinition[];
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
    const [cards, records, assessments, lessons, notes, questions] = await db.transaction(
      'r',
      [db.cards, db.courses, db.courseAssessments, db.lessons, db.notes, db.questions],
      () =>
        Promise.all([
          db.cards.toArray(),
          db.courses.orderBy('createdAt').toArray(),
          db.courseAssessments.toArray(),
          db.lessons.orderBy('orderIndex').toArray(),
          db.notes.toArray(),
          db.questions.toArray(),
        ]),
    );
    return {
      cards,
      courses: hydrateCourses(records, assessments),
      lessons,
      notes,
      questions,
    };
  }, []);
}
