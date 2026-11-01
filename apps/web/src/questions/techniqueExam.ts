import type { CourseAssessment, CourseRecord, Lesson } from '@lacuna/core/db/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import type { Concept } from '@lacuna/core/questions/types';
import { specificationAssessmentPointIds } from '../specifications/assessment';
import { resolveLessonOrder } from '../course/lessonOrder';

/** Explicit assessment membership wins; otherwise use authored lesson coverage. */
export function techniqueExamDate(
  sets: readonly QuestionSetRecord[],
  assessments: readonly CourseAssessment[],
  lessons: readonly Lesson[],
  now: number,
  preferredLessonIds?: readonly string[],
  concepts: readonly Concept[] = [],
  course?: CourseRecord,
): number | undefined {
  const ordered = resolveLessonOrder([...lessons], preferredLessonIds);
  const dates = assessments
    .filter((assessment) => {
      if (
        assessment.examDate === undefined ||
        assessment.examDate <= now ||
        assessment.needsAuthorConfirmation
      )
        return false;
      return sets.some((set) => {
        if (set.courseId !== assessment.courseId) return false;
        if (set.assessmentIds.length) return set.assessmentIds.includes(assessment.id);
        if (assessment.coverageMode === 'specification') {
          try {
            const points = new Set(specificationAssessmentPointIds(assessment, course));
            const ids = new Set(
              concepts
                .filter((concept) =>
                  concept.specificationPointIds?.some((point) => points.has(point)),
                )
                .map((concept) => concept.id),
            );
            return set.questions.some((question) =>
              [
                question.answer,
                ...question.parts.flatMap((part) => [
                  part.answer,
                  ...part.subparts.map((subpart) => subpart.answer),
                ]),
              ].some((answer) =>
                answer?.allocations.some((allocation) =>
                  allocation.targetConceptIds.some((id) => ids.has(id)),
                ),
              ),
            );
          } catch {
            return false;
          }
        }
        const end =
          assessment.afterLessonId === null
            ? assessment.kind === 'final'
              ? ordered.length - 1
              : -1
            : ordered.findIndex((lesson) => lesson.id === assessment.afterLessonId);
        const covered = new Set(
          assessment.coverageMode === 'custom'
            ? assessment.lessonIds
            : ordered.slice(0, end + 1).map((lesson) => lesson.id),
        );
        return set.lessonIds.some((id) => covered.has(id));
      });
    })
    .map((assessment) => assessment.examDate as number);
  return dates.length ? Math.min(...dates) : undefined;
}
