import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { finalAssessmentForCourse, hydrateCourse } from '../db/assessmentMigration';
import type {
  Card,
  Course,
  CourseAssessment,
  CourseRecord,
  Lesson,
  Note,
} from '@lacuna/core/db/types';
import type { QuestionDefinition } from '@lacuna/core/questions/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';

export interface SearchData {
  cards: Card[];
  courses: Course[];
  lessons: Lesson[];
  notes: Note[];
  questions: QuestionDefinition[];
  questionSets: QuestionSetRecord[];
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
    const [cards, records, assessments, lessons, notes, questions, questionSets] =
      await db.transaction(
        'r',
        [
          db.cards,
          db.courses,
          db.courseAssessments,
          db.lessons,
          db.notes,
          db.questions,
          db.questionSets,
        ],
        () =>
          Promise.all([
            db.cards.toArray(),
            db.courses.orderBy('createdAt').toArray(),
            db.courseAssessments.toArray(),
            db.lessons.orderBy('orderIndex').toArray(),
            db.notes.toArray(),
            db.questions.toArray(),
            db.questionSets.toArray(),
          ]),
      );
    return {
      cards,
      courses: hydrateCourses(records, assessments),
      lessons,
      notes,
      questions,
      questionSets,
    };
  }, []);
}
