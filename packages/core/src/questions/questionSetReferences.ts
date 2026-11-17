import type { QuestionSetRecord } from './questionSetCodec';
import type { Concept } from './types';
import { referencedQuestionSetConceptIds } from './questionSets';

export function assertQuestionSetReferences(
  records: readonly QuestionSetRecord[],
  courses: readonly { id: string }[],
  lessons: readonly { id: string; courseId: string }[],
  assessments: readonly { id: string; courseId: string }[],
  concepts: readonly Concept[],
): void {
  const courseIds = new Set(courses.map((row) => row.id));
  const lessonCourse = new Map(lessons.map((row) => [row.id, row.courseId]));
  const assessmentCourse = new Map(assessments.map((row) => [row.id, row.courseId]));
  const conceptCourse = new Map(concepts.map((row) => [row.id, row.courseId]));
  for (const record of records) {
    if (!courseIds.has(record.courseId))
      throw new Error('A Question Set refers to a missing Course.');
    if (record.lessonIds.some((id) => lessonCourse.get(id) !== record.courseId)) {
      throw new Error('A Question Set refers to a missing or cross-Course Lesson.');
    }
    if (record.assessmentIds.some((id) => assessmentCourse.get(id) !== record.courseId)) {
      throw new Error('A Question Set refers to a missing or cross-Course Assessment.');
    }
    const linkedConcepts = referencedQuestionSetConceptIds(record);
    if (linkedConcepts.some((id) => conceptCourse.get(id) !== record.courseId)) {
      throw new Error('A Question Set refers to a missing or cross-Course Concept.');
    }
  }
}
