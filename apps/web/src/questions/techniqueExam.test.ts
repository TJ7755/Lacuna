import { expect, it } from 'vitest';
import type { CourseAssessment } from '@lacuna/core/db/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import { techniqueExamDate } from './techniqueExam';

const set: QuestionSetRecord = {
  id: 'set',
  courseId: 'c',
  title: 'Questions',
  questions: [],
  lessonIds: [],
  assessmentIds: ['exam'],
  contentVersion: 1,
  contentRevisionId: 'v1',
  createdAt: 1,
  updatedAt: 1,
};
function assessment(id: string, examDate: number): CourseAssessment {
  return {
    id,
    courseId: 'c',
    name: id,
    kind: 'checkpoint',
    afterLessonId: null,
    coverageMode: 'prefix',
    examDate,
    excludedCardIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

it('chooses only the nearest applicable strictly future assessment regardless of order', () => {
  for (let now = 0; now < 100; now++) {
    const exams = [
      assessment('exam', now + 1),
      assessment('unrelated', now + 0.5),
      assessment('exam', now),
      assessment('exam', now + 5),
    ];
    expect(techniqueExamDate([set], exams, [], now)).toBe(now + 1);
    expect(techniqueExamDate([set], exams.reverse(), [], now)).toBe(now + 1);
    expect(techniqueExamDate([set], [assessment('exam', now)], [], now)).toBeUndefined();
  }
});
