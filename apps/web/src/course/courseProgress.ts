import type {
  Card,
  Course,
  CourseAssessment,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
} from '@lacuna/core/db/types';
import { dueReviewPool, isAvailable } from '../fsrs/eligibility';
import { isUpcomingExamDate, makeExamDateContext, resolveCardExamDate } from '../fsrs/examDate';
import { progressValue } from '../fsrs/objective';
import { MASTERY_R } from '@lacuna/core/fsrs/params';
import { predictedRetrievabilityAtHorizon } from '../fsrs/progress';
import type { Concept } from '@lacuna/core/questions/types';
import { calendarDaysUntil } from '../utils/datetime';
import { resolveAssessmentCoverage } from './assessmentCoverage';
import { courseLessonOrderPreference } from './lessonOrder';

// The Progress page's measures. Each scope defines one card pool and one forecast
// date, and every figure on the page (headline, lessons, next action) reads them
// from here so their denominators agree. The whole-course figure is the same
// objective-aware value as the course summary; an assessment figure is the same
// value as the Study hand-off for that assessment.

export interface CourseProgressInput {
  course: Course;
  lessons: Lesson[];
  cards: Card[];
  assessments: CourseAssessment[];
  links: LessonCardLink[];
  exposures: LessonCardExposure[];
  concepts: readonly Concept[];
  /** Absent for the whole course. */
  assessmentId?: string;
  now?: number;
}

export type ProgressForecast =
  /** One assessment, measured at its own date. */
  | { kind: 'assessment'; date: number; daysRemaining: number; value: number; securedCards: number }
  /** The whole course: each card at its next applicable test or paper. */
  | {
      kind: 'applicable';
      value: number;
      securedCards: number;
      undatedCards: number;
      /** Set when every counted card targets this one future date. */
      sharedDate?: number;
      /** Cards grouped by the date they are measured at, nearest first; undated cards last. */
      papers: PaperForecast[];
    }
  /** The selected assessment's date has passed. */
  | { kind: 'past'; date: number }
  /** The selected assessment has no date. */
  | { kind: 'undated' }
  /** No counted cards in scope. */
  | { kind: 'empty' };

/** The lesson-row id for counted cards whose primary lesson has no row in the scope. */
export const OTHER_CARDS_ROW = '';

export interface PaperForecast {
  /** Undefined for cards with no upcoming test or paper, measured at the maintenance horizon. */
  date?: number;
  /** Assessments on this date, so a row can select one. */
  assessments: { id: string; name: string }[];
  cardCount: number;
  value: number;
}

export interface LessonProgress {
  lessonId: string;
  name: string;
  cardCount: number;
  reviewedCards: number;
  /** Null for a lesson with no counted cards, which is not the same as 0%. */
  value: number | null;
}

export interface CourseProgressReport {
  assessment?: CourseAssessment;
  timeZone?: string;
  /** Cards behind every figure: in scope, outside extension lessons and not suspended or buried. */
  cards: Card[];
  cardCount: number;
  /** Lessons the scope covers, extensions included, for scoping lesson-linked questions. */
  lessonIds: string[];
  /** Course Concepts in scope: every one for the whole course, otherwise those of the scope's cards. */
  conceptIds: string[];
  /** In-scope cards left out of the figures, so the reader can reconcile the totals. */
  excluded: { extension: number; unavailable: number };
  /** A partition of `cardCount`. */
  study: { reviewed: number; taughtNotReviewed: number; notStarted: number };
  dueCards: number;
  forecast: ProgressForecast;
  /** Informational overlapping assessments; never used for scheduling or headline totals. */
  laterPapers: PaperForecast[];
  /** Partitions `cards`: lesson rows, then an `OTHER_CARDS_ROW` when any card has no row. */
  lessons: LessonProgress[];
}

/** Assessments a learner can select: upcoming nearest first, then undated, then passed most recent first. */
export function selectableAssessments(
  assessments: readonly CourseAssessment[],
  courseId: string,
  now: number,
): CourseAssessment[] {
  const rank = (assessment: CourseAssessment) =>
    assessment.examDate === undefined ? 1 : isUpcomingExamDate(assessment.examDate, now) ? 0 : 2;
  return assessments
    .filter((assessment) => assessment.courseId === courseId)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (rank(a) === 2
          ? (b.examDate as number) - (a.examDate as number)
          : (a.examDate ?? 0) - (b.examDate ?? 0)) ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    );
}

export function buildCourseProgress(input: CourseProgressInput): CourseProgressReport {
  const now = input.now ?? Date.now();
  const { course } = input;
  const courseCards = input.cards.filter((card) => card.courseId === course.id);
  const courseLessons = input.lessons.filter((lesson) => lesson.courseId === course.id);
  const assessment = input.assessments.find(
    (candidate) => candidate.courseId === course.id && candidate.id === input.assessmentId,
  );
  const coverage = assessment
    ? resolveAssessmentCoverage(
        assessment,
        courseLessons,
        courseCards,
        input.links,
        courseLessonOrderPreference(course),
        { course, concepts: input.concepts },
      )
    : undefined;
  const scopeCards = coverage?.cards ?? courseCards;
  const extensionIds = new Set(
    courseLessons.filter((lesson) => lesson.isExtension).map((lesson) => lesson.id),
  );
  const isExtension = (card: Card) => extensionIds.has(card.primaryLessonId ?? '');
  const counted = scopeCards.filter((card) => !isExtension(card) && isAvailable(card, now));

  const exposedIds = new Set(input.exposures.map((exposure) => exposure.cardId));
  const schoolLessonIds = new Set(course.schoolCoveredLessonIds ?? []);
  const reviewed = counted.filter((card) => card.lastReviewed !== null);
  const taughtNotReviewed = counted.filter(
    (card) =>
      card.lastReviewed === null &&
      (exposedIds.has(card.id) || schoolLessonIds.has(card.primaryLessonId ?? '')),
  ).length;

  const examDateContext = makeExamDateContext(
    course,
    courseLessons,
    input.assessments.filter((candidate) => candidate.courseId === course.id),
    input.links,
    [...input.concepts],
  );
  // A selected assessment has one horizon; nearer papers and lesson overrides cannot replace it.
  const target =
    assessment && isUpcomingExamDate(assessment.examDate, now)
      ? { ...course, examDate: assessment.examDate }
      : undefined;
  const measure = (cards: Card[]) =>
    target ? progressValue(cards, target, now) : progressValue(cards, course, now, examDateContext);
  const secured = (cards: Card[]) =>
    cards.filter(
      (card) =>
        (target
          ? predictedRetrievabilityAtHorizon(card, target, now)
          : predictedRetrievabilityAtHorizon(card, course, now, examDateContext)) >= MASTERY_R,
    ).length;

  let forecast: ProgressForecast;
  if (counted.length === 0) forecast = { kind: 'empty' };
  else if (assessment && assessment.examDate === undefined) forecast = { kind: 'undated' };
  else if (assessment && !target) forecast = { kind: 'past', date: assessment.examDate as number };
  else if (target)
    forecast = {
      kind: 'assessment',
      date: target.examDate,
      daysRemaining: calendarDaysUntil(
        target.examDate,
        now,
        assessment?.timeZone ?? course.timeZone,
      ),
      value: measure(counted),
      securedCards: secured(counted),
    };
  else {
    const dates = counted.map((card) => {
      const date = resolveCardExamDate(card, examDateContext, now);
      return isUpcomingExamDate(date, now) ? date : undefined;
    });
    const shared = new Set(dates);
    const sharedDate = shared.size === 1 ? dates[0] : undefined;
    const byDate = new Map<number | undefined, Card[]>();
    counted.forEach((card, index) => {
      const group = byDate.get(dates[index]) ?? [];
      group.push(card);
      byDate.set(dates[index], group);
    });
    const papers = [...byDate]
      .sort(([a], [b]) => (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY))
      .map(([date, cards]): PaperForecast => ({
        ...(date === undefined ? {} : { date }),
        assessments:
          date === undefined
            ? []
            : selectableAssessments(input.assessments, course.id, now)
                .filter((candidate) => candidate.examDate === date)
                .map(({ id, name }) => ({ id, name })),
        cardCount: cards.length,
        value: measure(cards),
      }));
    forecast = {
      kind: 'applicable',
      value: measure(counted),
      securedCards: secured(counted),
      undatedCards: dates.filter((date) => date === undefined).length,
      ...(sharedDate === undefined ? {} : { sharedDate }),
      papers,
    };
  }

  const forecastable = forecast.kind === 'assessment' || forecast.kind === 'applicable';
  const lessonRows = (coverage?.coveredLessons ?? courseLessons).filter(
    (lesson) => !lesson.isExtension,
  );
  const row = (lessonId: string, name: string, lessonCards: Card[]): LessonProgress => ({
    lessonId,
    name,
    cardCount: lessonCards.length,
    reviewedCards: lessonCards.filter((card) => card.lastReviewed !== null).length,
    value: forecastable && lessonCards.length > 0 ? measure(lessonCards) : null,
  });
  const lessons = lessonRows.map((lesson) =>
    row(
      lesson.id,
      lesson.name,
      counted.filter((card) => card.primaryLessonId === lesson.id),
    ),
  );
  // Cards with no lesson, or linked into this scope from a lesson outside it, still count
  // in the headline, so they get a row and the rows partition the pool.
  const rowIds = new Set(lessonRows.map((lesson) => lesson.id));
  const other = counted.filter((card) => !rowIds.has(card.primaryLessonId ?? ''));
  if (other.length > 0) lessons.push(row(OTHER_CARDS_ROW, 'Other cards', other));

  const laterPapers: PaperForecast[] = assessment
    ? []
    : selectableAssessments(input.assessments, course.id, now).flatMap((paper) => {
        const date = paper.examDate;
        if (!isUpcomingExamDate(date, now)) return [];
        const covered = resolveAssessmentCoverage(
          paper,
          courseLessons,
          courseCards,
          input.links,
          courseLessonOrderPreference(course),
          { course, concepts: input.concepts },
        );
        const ids = new Set(covered.cards.map((card) => card.id));
        const cards = counted.filter((card) => ids.has(card.id));
        const overlapsEarlierTarget = cards.some((card) => {
          const nearest = resolveCardExamDate(card, examDateContext, now);
          return nearest !== undefined && nearest < date;
        });
        if (!overlapsEarlierTarget) return [];
        return [
          {
            date,
            assessments: [{ id: paper.id, name: paper.name }],
            cardCount: cards.length,
            value: progressValue(cards, { ...course, examDate: date }, now),
          },
        ];
      });

  return {
    laterPapers,
    ...(assessment ? { assessment } : {}),
    ...((assessment?.timeZone ?? course.timeZone)
      ? { timeZone: assessment?.timeZone ?? course.timeZone }
      : {}),
    cards: counted,
    cardCount: counted.length,
    lessonIds: (coverage?.coveredLessons ?? courseLessons).map((lesson) => lesson.id),
    conceptIds: coverage
      ? [...new Set(counted.map((card) => card.conceptId))]
      : input.concepts.flatMap((concept) =>
          concept.scope === 'course' && concept.courseId === course.id ? [concept.id] : [],
        ),
    excluded: {
      extension: scopeCards.filter(isExtension).length,
      unavailable: scopeCards.filter((card) => !isExtension(card) && !isAvailable(card, now))
        .length,
    },
    study: {
      reviewed: reviewed.length,
      taughtNotReviewed,
      notStarted: counted.length - reviewed.length - taughtNotReviewed,
    },
    dueCards: dueReviewPool(counted, course, now).length,
    forecast,
    lessons,
  };
}

/**
 * Lesson-linked questions and their attempts within a report's scope. The whole course keeps
 * every question; an assessment keeps those with a primary or additional lesson it covers.
 */
export function scopeQuestions<
  Q extends { id: string; primaryLessonId: string | null; additionalLessonIds: string[] },
  A extends { questionId: string },
>(report: CourseProgressReport, questions: readonly Q[], attempts: readonly A[]) {
  if (!report.assessment) return { questions: [...questions], attempts: [...attempts] };
  const lessons = new Set(report.lessonIds);
  const scoped = questions.filter((question) =>
    [question.primaryLessonId, ...question.additionalLessonIds].some(
      (id) => id !== null && lessons.has(id),
    ),
  );
  const ids = new Set(scoped.map((question) => question.id));
  return {
    questions: scoped,
    attempts: attempts.filter((attempt) => ids.has(attempt.questionId)),
  };
}
