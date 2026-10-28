import { courseLessonOrderPreference } from '../../course/lessonOrder';
import { loadSimpleSession, type SimpleSessionScope } from './simpleSessionPersistence';
import { lessonCardMembership } from '../../course/lessonMembership';
import { db } from '../../db/schema';
import { listCourseAssessments } from '../../db/read';
import { hydrateCardsWithHistory } from '../../db/reviewHistoryRead';
import type { Card, Course, Lesson, RevisionPlan } from '../../db/types';
import type { SessionCardOutcome } from './types';
import type { CardFilter } from '../../db/search';
import { isLessonUnlocked, lessonEffectiveReleaseDates } from '../../course/path';
import { catchUpPracticePool } from '../../course/catchUpPractice';
import { earlierCourseLessonIds } from '../../course/courseEntry';
import { assessmentPracticePool } from '../../course/assessmentPractice';
import { resolveAssessmentCoverage } from '../../course/assessmentCoverage';
import {
  dueReviewPool,
  eligiblePracticePool,
  examPracticePool,
  practiceCardScope,
} from '../../course/studyPools';
import { makeExamDateContext } from '../../fsrs/examDate';
import { finalAssessmentForCourse, hydrateCourse } from '../../db/assessmentMigration';
import type { SessionUnit } from '../../fsrs/session';
import { resolveSpecificationStudyScope } from '../../course/specificationStudyScope';

/** Global study keeps scheduling-unit ownership while honouring each Course's papers. */
export async function loadGlobalSessionSource() {
  const [schedulingUnits, rawCards, assessments] = await Promise.all([
    db.schedulingUnits.toArray(),
    db.cards.toArray(),
    db.courseAssessments.toArray(),
  ]);
  const cards = await hydrateCardsWithHistory(rawCards);
  const paperCourseIds = [
    ...new Set(
      assessments
        .filter((assessment) => assessment.coverageMode === 'specification')
        .map((assessment) => assessment.courseId),
    ),
  ];
  if (!paperCourseIds.length) return { schedulingUnits, sessionUnits: schedulingUnits, cards };
  const [records, lessons, concepts] = await Promise.all([
    db.courses.bulkGet(paperCourseIds),
    db.lessons.where('courseId').anyOf(paperCourseIds).toArray(),
    db.concepts.where('courseId').anyOf(paperCourseIds).toArray(),
  ]);
  const links = lessons.length
    ? await db.lessonCards
        .where('lessonId')
        .anyOf(lessons.map((lesson) => lesson.id))
        .toArray()
    : [];
  const contexts = new Map(
    records.flatMap((record) => {
      if (!record) return [];
      const courseAssessments = assessments.filter(
        (assessment) => assessment.courseId === record.id,
      );
      const course = hydrateCourse(record, finalAssessmentForCourse(record.id, courseAssessments));
      return [
        [
          record.id,
          makeExamDateContext(
            course,
            lessons.filter((lesson) => lesson.courseId === record.id),
            courseAssessments,
            links,
            concepts,
          ),
        ],
      ] as const;
    }),
  );
  const sessionUnits = schedulingUnits.map((unit) => {
    const context = unit.courseId ? contexts.get(unit.courseId) : undefined;
    return context
      ? ({
          config: unit,
          scope: { kind: 'scheduling-unit', schedulingUnitId: unit.id },
          examDateContext: context,
        } satisfies SessionUnit)
      : unit;
  });
  return { schedulingUnits, sessionUnits, cards };
}

interface CoursePoolRequest {
  standaloneSimple: boolean;
  requestScopeLessonIds: string[] | undefined;
  requestSpecificationPointId?: string;
  practiceNodeKeyParam: string | null;
  requestAssessmentId: string | undefined;
  filterParams: CardFilter[];
  examPractice: boolean;
  catchUpPractice: boolean;
}

/** Load curricular evidence once; optional passes deliberately skip practice reads. */
export async function loadCourseSessionSource(courseId: string, standaloneSimple: boolean) {
  const [rawAllCards, courseLessons, examDates, manualNodes, concepts] = await Promise.all([
    db.cards.where('courseId').equals(courseId).toArray(),
    db.lessons.where('courseId').equals(courseId).sortBy('orderIndex'),
    listCourseAssessments(courseId),
    standaloneSimple ? [] : db.practiceNodes.where('courseId').equals(courseId).toArray(),
    db.concepts.where('courseId').equals(courseId).toArray(),
  ]);
  const allCards = await hydrateCardsWithHistory(rawAllCards);
  const courseLessonIds = courseLessons.map((lesson) => lesson.id);
  const [courseLinks, courseExposures] = await Promise.all([
    (!standaloneSimple ||
      examDates.some((assessment) => assessment.coverageMode === 'specification')) &&
    courseLessonIds.length > 0
      ? db.lessonCards.where('lessonId').anyOf(courseLessonIds).toArray()
      : [],
    !standaloneSimple && courseLessonIds.length > 0
      ? db.lessonCardExposures.where('lessonId').anyOf(courseLessonIds).toArray()
      : [],
  ]);
  return {
    allCards,
    courseLessons,
    examDates,
    manualNodes,
    courseLinks,
    courseExposures,
    concepts,
  };
}

type CourseSessionSource = Awaited<ReturnType<typeof loadCourseSessionSource>>;

export function resolveCourseSessionSelection(
  course: Course,
  source: CourseSessionSource,
  {
    standaloneSimple,
    requestScopeLessonIds,
    practiceNodeKeyParam,
    requestAssessmentId,
  }: CoursePoolRequest,
) {
  const { courseLessons, examDates, manualNodes } = source;
  const effectiveDates = standaloneSimple
    ? new Map<string, number>()
    : lessonEffectiveReleaseDates(course, courseLessons);
  const reachedLessonIds: Set<string> = standaloneSimple
    ? new Set<string>()
    : requestScopeLessonIds
      ? new Set<string>(requestScopeLessonIds)
      : new Set(
          courseLessons
            .filter((lesson) => isLessonUnlocked(course, lesson, effectiveDates, courseLessons))
            .map((lesson) => lesson.id),
        );
  const practiceNode = practiceNodeKeyParam
    ? manualNodes.find((node) => node.id === practiceNodeKeyParam)
    : undefined;
  const selectedAssessment = requestAssessmentId
    ? examDates.find((assessment) => assessment.id === requestAssessmentId)
    : undefined;
  return { reachedLessonIds, practiceNode, selectedAssessment };
}

/** Select the study pool without changing the session's refs or starting a revision window. */
export function prepareCourseSessionPool(
  course: Course,
  source: CourseSessionSource,
  selection: ReturnType<typeof resolveCourseSessionSelection>,
  {
    standaloneSimple,
    practiceNodeKeyParam,
    filterParams,
    examPractice,
    catchUpPractice,
    requestSpecificationPointId,
    requestAssessmentId,
  }: CoursePoolRequest,
  activeRevisionPlan: RevisionPlan | null,
) {
  const {
    allCards,
    courseLessons,
    examDates,
    manualNodes,
    courseLinks,
    courseExposures,
    concepts,
  } = source;
  const { reachedLessonIds, practiceNode, selectedAssessment } = selection;
  // Optional passes need scheduling context, but no curricular eligibility planning.
  const dueReview = !selectedAssessment && !practiceNodeKeyParam && filterParams.includes('due');
  const fullScope =
    standaloneSimple || dueReview || examPractice
      ? allCards
      : selectedAssessment
        ? resolveAssessmentCoverage(
            selectedAssessment,
            courseLessons,
            allCards,
            courseLinks,
            courseLessonOrderPreference(course),
            { course, concepts },
          ).cards
        : practiceCardScope(
            allCards,
            courseLinks,
            courseExposures,
            {
              reachedLessonIds,
              practiceNode,
              requireExposure: course.learnFirst !== false,
            },
            Date.now(),
            course.leechThreshold,
          );
  const examDateContext = selectedAssessment
    ? {
        courseExamDate: selectedAssessment.examDate,
        lessonsById: new Map<string, Lesson>(),
        courseAssessments: [],
      }
    : makeExamDateContext(course, courseLessons, examDates, courseLinks, concepts);
  const cards = catchUpPractice
    ? catchUpPracticePool(
        allCards,
        course,
        courseLessons,
        courseLinks,
        examDateContext,
        reachedLessonIds,
        Date.now(),
        earlierCourseLessonIds(course, courseLessons, examDates, manualNodes),
      )
    : standaloneSimple
      ? course.archived
        ? []
        : allCards
      : selectedAssessment
        ? activeRevisionPlan
          ? allCards.filter((card) => activeRevisionPlan.scope.eligibleCardIds.includes(card.id))
          : assessmentPracticePool(selectedAssessment, {
              course,
              concepts,
              assessments: examDates,
              practiceNodes: manualNodes,
              lessons: courseLessons,
              cards: allCards,
              links: courseLinks,
              exposures: courseExposures,
              reachedLessonIds,
            })
        : dueReview
          ? dueReviewPool(fullScope, course)
          : examPractice
            ? examPracticePool(fullScope, course, examDateContext)
            : eligiblePracticePool(fullScope, course, examDateContext);
  if (requestSpecificationPointId === undefined)
    return { cards, examDateContext, scopeTitle: undefined };
  const scoped = resolveSpecificationStudyScope({
    course,
    pointId: requestSpecificationPointId,
    cards: allCards,
    concepts,
    lessons: courseLessons,
    assessments: examDates,
    links: courseLinks,
    assessmentId: requestAssessmentId,
  });
  const ids = new Set(scoped?.cardIds ?? []);
  const extensionIds = new Set(
    courseLessons.filter((lesson) => lesson.isExtension).map((lesson) => lesson.id),
  );
  return {
    cards: cards.filter(
      (card) => ids.has(card.id) && !extensionIds.has(card.primaryLessonId ?? ''),
    ),
    examDateContext,
    scopeTitle: scoped?.title,
  };
}

export async function loadLessonSessionSource(courseId: string, lessonId: string) {
  const [courseLessons, examDates, rawAllCourseCards, lessonExposures, concepts] =
    await Promise.all([
      db.lessons.where('courseId').equals(courseId).toArray(),
      listCourseAssessments(courseId),
      db.cards.where('courseId').equals(courseId).toArray(),
      db.lessonCardExposures.where('lessonId').equals(lessonId).toArray(),
      db.concepts.where('courseId').equals(courseId).toArray(),
    ]);
  const courseLinks = courseLessons.length
    ? await db.lessonCards
        .where('lessonId')
        .anyOf(courseLessons.map((lesson) => lesson.id))
        .toArray()
    : [];
  const links = courseLinks.filter((link) => link.lessonId === lessonId);
  const allCourseCards = await hydrateCardsWithHistory(rawAllCourseCards);
  const linkedCardIds = new Set(links.map((link) => link.cardId));
  const membership = lessonCardMembership(lessonId, allCourseCards, links);
  return {
    courseLessons,
    examDates,
    links,
    courseLinks,
    concepts,
    allCourseCards,
    lessonExposures,
    linkedCardIds,
    membership,
  };
}

/** Restore the saved pass without shuffling it again; new passes shuffle exactly once. */
export function prepareSimpleSessionQueue(
  cards: Card[],
  scope: SimpleSessionScope,
  createQueue: (cards: Card[]) => Card[],
) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const resumed = loadSimpleSession(
    scope,
    cards.map((card) => card.id),
  );
  const queue = resumed
    ? resumed.queueCardIds.flatMap((cardId) => {
        const card = cardsById.get(cardId);
        return card ? [card] : [];
      })
    : createQueue(cards);
  return {
    queue,
    mastered: new Set(resumed?.masteredCardIds ?? []),
    wrong: new Set(
      [...(resumed?.outcomes ?? [])]
        .filter(([, outcome]) => outcome === 'wrong')
        .map(([cardId]) => cardId),
    ),
    events: resumed?.events ?? [],
    recitations: resumed?.recitations ?? new Map<string, unknown>(),
    outcomes: resumed?.outcomes ?? new Map<string, SessionCardOutcome>(),
  };
}
