import { courseLessonOrderPreference } from '../course/lessonOrder';
// Lesson overrides win. Otherwise target the nearest applicable upcoming paper
// or checkpoint. A specification-scoped final covers only its linked Concepts;
// legacy finals retain the course-wide fallback used by existing courses.

import {
  resolveAssessmentCoverage,
  type AssessmentSpecificationContext,
} from '../course/assessmentCoverage';
import type { Card, Course, CourseAssessment, Lesson, LessonCardLink } from '@lacuna/core/db/types';
import type { Concept } from '@lacuna/core/questions/types';

export interface ExamDateContext {
  /** The Course.examDate default, used when nothing nearer applies. */
  courseExamDate?: number;
  preferredLessonIds?: readonly string[];
  /** Lessons keyed by id, for the lesson-level examDate override lookup. */
  lessonsById: Map<string, Lesson>;
  /** Checkpoints / extra exam dates for the course. */
  courseAssessments: CourseAssessment[];
  /** Additional effective lesson memberships for cards. */
  lessonCardLinks?: LessonCardLink[];
  specificationContext?: AssessmentSpecificationContext;
}

/** Build a resolution context once for a course, reused across its cards. */
export function makeExamDateContext(
  course: Course,
  lessons: Lesson[],
  assessments: CourseAssessment[],
  lessonCardLinks: LessonCardLink[] = [],
  concepts: readonly Concept[] = [],
): ExamDateContext {
  return {
    ...(course.examDate === undefined ? {} : { courseExamDate: course.examDate }),
    lessonsById: new Map(lessons.map((l) => [l.id, l])),
    courseAssessments: assessments,
    lessonCardLinks,
    preferredLessonIds: courseLessonOrderPreference(course),
    specificationContext: { course, concepts },
  };
}

/** Whether the authoritative assessment coverage contains this Card. */
function assessmentApplies(
  assessment: CourseAssessment,
  card: Card,
  ctx: ExamDateContext,
): boolean {
  return resolveAssessmentCoverage(
    assessment,
    [...ctx.lessonsById.values()],
    [card],
    ctx.lessonCardLinks ?? [],
    ctx.preferredLessonIds,
    ctx.specificationContext,
  ).cards.some((coveredCard) => coveredCard.id === card.id);
}

/**
 * Resolve a Card's next real assessment target without changing its recall evidence.
 * No upcoming applicable paper leaves it in ordinary maintenance scheduling.
 */
export function resolveCardExamDate(
  card: Card,
  ctx: ExamDateContext,
  now: number = Date.now(),
): number | undefined {
  // 1. Lesson override wins outright (past or future).
  if (card.primaryLessonId !== null && card.primaryLessonId !== undefined) {
    const lesson = ctx.lessonsById.get(card.primaryLessonId);
    if (lesson?.examDate !== undefined) return lesson.examDate;
  }

  // A specification-scoped final is one paper, not a course-wide fallback.
  const specificationFinal = ctx.courseAssessments.some(
    (assessment) => assessment.kind === 'final' && assessment.coverageMode === 'specification',
  );
  // 2. Nearest applicable future assessment. Legacy finals retain their fallback semantics.
  let nearest: number | undefined;
  for (const assessment of ctx.courseAssessments) {
    if (
      (assessment.kind !== 'checkpoint' && !specificationFinal) ||
      assessment.examDate === undefined ||
      assessment.examDate < now
    ) {
      continue;
    }
    if (!assessmentApplies(assessment, card, ctx)) continue;
    if (nearest === undefined || assessment.examDate < nearest) {
      nearest = assessment.examDate;
    }
  }
  if (nearest !== undefined) return nearest;

  // 3. Course default.
  return specificationFinal ? undefined : ctx.courseExamDate;
}
