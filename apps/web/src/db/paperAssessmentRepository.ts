import { courseLessonOrderPreference } from '../course/lessonOrder';
import { resolveAssessmentCoverage } from '../course/assessmentCoverage';
import { validatePaperAssessmentDates } from '../specifications/assessment';
import { papersForSelection } from '@lacuna/core/specifications/selection';
import { finalAssessmentForCourse } from './assessmentMigration';
import { validateAssessmentStructure } from './assessmentValidation';
import { syncCourseSchedulingUnits } from './backingDecks';
import { friendlyDbError } from './dbErrors';
import { stampUpdatedAt } from './mutationStamp';
import { db, makeId } from './schema';
import type { CourseAssessment } from '@lacuna/core/db/types';

/** Set up all applicable papers together, retaining the existing final assessment identity. */
export async function setCoursePaperAssessments(
  courseId: string,
  dates: readonly { paperId: string; examDate: number; timeZone?: string }[],
): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.courses,
        db.courseAssessments,
        db.lessons,
        db.cards,
        db.concepts,
        db.lessonCards,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
      ],
      async () => {
        const course = await db.courses.get(courseId);
        if (!course?.specificationData || !course.specificationRef) {
          throw new Error('The Course does not supply a specification with paper definitions.');
        }
        const existing = await db.courseAssessments.where('courseId').equals(courseId).toArray();
        if (existing.some((entry) => entry.coverageMode === 'specification')) {
          throw new Error('Papers are already configured. Edit their individual dates instead.');
        }
        const final = finalAssessmentForCourse(courseId, existing);
        const papers = papersForSelection(course.specificationData, course.specificationRef);
        if (
          dates.length !== papers.length ||
          new Set(dates.map((date) => date.paperId)).size !== papers.length ||
          dates.some((date) => !papers.some((paper) => paper.id === date.paperId))
        ) {
          throw new Error('Supply exactly one date for every applicable paper.');
        }
        const ordered = [...dates].sort((left, right) => left.examDate - right.examDate);
        const last = ordered[ordered.length - 1];
        if (!last) throw new Error('No papers apply to this specification selection.');
        const now = Date.now();
        const [lessons, cards, links, concepts] = await Promise.all([
          db.lessons.where('courseId').equals(courseId).toArray(),
          db.cards.where('courseId').equals(courseId).toArray(),
          db.lessonCards.toArray(),
          db.concepts.where('courseId').equals(courseId).toArray(),
        ]);
        const entries: CourseAssessment[] = ordered.map((date) => {
          const paper = papers.find((paper) => paper.id === date.paperId)!;
          return stampUpdatedAt(
            {
              id: date === last ? final.id : makeId(),
              courseId,
              kind: date === last ? 'final' : 'checkpoint',
              name: `${paper.ref}: ${paper.title}`,
              examDate: date.examDate,
              timeZone: date.timeZone,
              afterLessonId: null,
              coverageMode: 'specification',
              specificationPaperId: paper.id,
              excludedCardIds: [],
              createdAt: date === last ? final.createdAt : now,
              updatedAt: now,
            },
            now,
          );
        });
        for (const entry of entries) {
          validateAssessmentStructure(entry);
          const resolved = resolveAssessmentCoverage(
            entry,
            lessons,
            cards,
            links,
            courseLessonOrderPreference(course),
            { course, concepts },
          );
          if (!resolved.validation.valid) throw new Error(resolved.validation.issues[0].message);
        }
        validatePaperAssessmentDates(entries);
        await db.courseAssessments.bulkPut(entries);
        await syncCourseSchedulingUnits(courseId);
      },
    );
  } catch (error) {
    throw friendlyDbError(error);
  }
}
