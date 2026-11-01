import { db } from '../../db/schema';
import { getCourse } from '../../db/read';
import { getSchedulingUnit } from '../../db/backingDecks';
import { refreshRevisionPlan, startRevisionWindow } from '../../db/revisionPlanRepository';
import type {
  Card,
  Lesson,
  RevisionPlan,
  SchedulerConfig,
  SchedulingUnitRecord,
} from '../../db/types';
import {
  directLessonStudyPool,
  lessonStudyPool,
  practiceCardScope,
  practiceScopeVersion,
} from '../../course/studyPools';
import { revisionProjection } from '../../course/revisionProjection';
import { makeExamDateContext } from '../../fsrs/examDate';
import { studyPool } from '../../fsrs/eligibility';
import type { SessionUnit } from '../../fsrs/session';
import type { StudyUnit } from './types';
import type { PracticeSession } from './sessionCompletionPersistence';
import {
  loadLessonSessionSource,
  loadCourseSessionSource,
  loadGlobalSessionSource,
  resolveCourseSessionSelection,
  prepareCourseSessionPool,
} from './sessionPool';
import type { CoursePoolRequest } from './sessionPool';

type SessionSchedulingConfig = SchedulerConfig & {
  dailyReviewGoal?: number;
  sessionTimeLimitMinutes?: number;
};

export interface SessionSourceRequest extends CoursePoolRequest {
  requestSpecificationPointId: string | undefined;
  lessonId: string | undefined;
  courseId: string | undefined;
  requestPlanId: string | undefined;
  requestWindowId: string | undefined;
  plannedRevision: boolean;
  requestMilestoneLessonIds: string[] | undefined;
}

export interface LoadedSessionSource {
  units: StudyUnit[];
  sessionUnits: Array<SchedulingUnitRecord | SessionUnit>;
  cards: Card[];
  resolvedCourseId: string | null;
  lessonHasMembers: boolean;
  reviewKind: 'scheduling-unit' | 'course';
  ratchetCourseId: string | null;
  ratchetLessonId: string | null;
  lessonExposureId: string | null;
  unitDisplayName: string | null;
  firstStudyLessonId?: string;
  firstStudyLessonName?: string;
  revisionPlan: RevisionPlan | null;
  revisionInitialRevision: number;
  revisionWindowStartedAt: number;
  revisionWindowBudgetSeconds: number;
  revisionSecondsRemaining: number;
  revisionNextWindowDay: string | undefined;
  practiceSession: PracticeSession | null;
}

/** Resolve the persisted study scope without publishing partially loaded React state. */
export async function loadSessionSource(
  request: SessionSourceRequest,
): Promise<LoadedSessionSource | { redirect: string }> {
  const {
    lessonId,
    courseId,
    standaloneSimple,
    requestScopeLessonIds,
    requestSpecificationPointId,
    practiceNodeKeyParam,
    requestAssessmentId,
    filterParams,
    examPractice,
    catchUpPractice,
    plannedRevision,
    requestPlanId,
    requestWindowId,
    requestMilestoneLessonIds,
  } = request;
  const result: Omit<LoadedSessionSource, 'units' | 'sessionUnits' | 'cards'> = {
    resolvedCourseId: null,
    lessonHasMembers: false,
    reviewKind: 'scheduling-unit',
    ratchetCourseId: null,
    ratchetLessonId: null,
    lessonExposureId: null,
    unitDisplayName: null,
    revisionPlan: null,
    revisionInitialRevision: 0,
    revisionWindowStartedAt: 0,
    revisionWindowBudgetSeconds: 0,
    revisionSecondsRemaining: 0,
    revisionNextWindowDay: undefined,
    practiceSession: null,
  };
  let units: StudyUnit[];
  let sessionUnits: Array<SchedulingUnitRecord | SessionUnit>;
  let cards: Card[];
  let firstStudyLessonId: string | undefined;
  let firstStudyLessonName: string | undefined;
  if (lessonId) {
    const lesson: Lesson | undefined = await db.lessons.get(lessonId);
    if (!lesson) {
      return { redirect: '/' };
    }
    const course = await getCourse(lesson.courseId);
    if (!course) {
      return { redirect: '/' };
    }
    result.resolvedCourseId = course.id;
    const {
      courseLessons,
      examDates,
      links,
      courseLinks,
      concepts,
      allCourseCards,
      lessonExposures,
      linkedCardIds,
      membership,
    } = await loadLessonSessionSource(course.id, lessonId);
    result.lessonHasMembers = membership.length > 0;
    const examDateContext = makeExamDateContext(
      course,
      courseLessons,
      examDates,
      courseLinks,
      concepts,
    );
    const schedulingUnit = (await getSchedulingUnit(course.id, lessonId)) ?? course;
    cards = standaloneSimple
      ? course.archived
        ? []
        : membership
      : course.learnFirst === false
        ? directLessonStudyPool(lessonId, allCourseCards, links, schedulingUnit)
        : lessonStudyPool(lessonId, allCourseCards, links, lessonExposures);
    units = [course];
    sessionUnits = [
      {
        config: schedulingUnit,
        scope: { kind: 'lesson', courseId: course.id, lessonId, linkedCardIds },
        examDateContext,
      },
    ];
    result.reviewKind = 'course';
    if (!standaloneSimple) {
      result.ratchetCourseId = course.id;
      result.ratchetLessonId = lessonId;
      result.lessonExposureId = lessonId;
    }
    result.unitDisplayName = lesson.name;
    firstStudyLessonId = standaloneSimple ? undefined : lessonId;
    firstStudyLessonName = lesson.name;
  } else if (courseId) {
    const course = await getCourse(courseId);
    if (!course) {
      return { redirect: '/' };
    }
    const poolRequest = {
      standaloneSimple,
      requestScopeLessonIds,
      requestSpecificationPointId,
      practiceNodeKeyParam,
      requestAssessmentId,
      filterParams,
      examPractice,
      catchUpPractice,
    };
    const source = await loadCourseSessionSource(courseId, standaloneSimple);
    const { allCards, courseLinks, courseExposures } = source;
    const selection = resolveCourseSessionSelection(course, source, poolRequest);
    const { practiceNode, selectedAssessment } = selection;
    if (requestAssessmentId && !selectedAssessment) {
      return { redirect: `/course/${courseId}` };
    }
    let activeRevisionPlan: RevisionPlan | null = null;
    if (plannedRevision && requestPlanId && requestWindowId && selectedAssessment) {
      const refreshed = await refreshRevisionPlan(requestPlanId, revisionProjection);
      if (
        refreshed.assessmentId !== selectedAssessment.id ||
        refreshed.courseId !== course.id ||
        !refreshed.windows.some((window) => window.id === requestWindowId)
      ) {
        throw new Error('The revision plan does not match this assessment window.');
      }
      activeRevisionPlan = await startRevisionWindow(requestPlanId, requestWindowId);
      const activeWindow = activeRevisionPlan.windows.find(
        (window) => window.id === requestWindowId,
      );
      result.revisionPlan = activeRevisionPlan;
      result.revisionInitialRevision = activeRevisionPlan.revision;
      result.revisionWindowStartedAt = activeWindow?.startedAt ?? Date.now();
      const budgetSeconds = (activeWindow?.budgetMinutes ?? 0) * 60;
      result.revisionWindowBudgetSeconds = budgetSeconds;
      result.revisionSecondsRemaining = Math.max(
        0,
        budgetSeconds - (Date.now() - result.revisionWindowStartedAt) / 1000,
      );
      result.revisionNextWindowDay = activeRevisionPlan.windows.find(
        (window) => window.status === 'scheduled' && window.id !== requestWindowId,
      )?.day;
    }
    const prepared: ReturnType<typeof prepareCourseSessionPool> & { scopeTitle?: string } =
      requestSpecificationPointId === undefined
        ? prepareCourseSessionPool(course, source, selection, poolRequest, activeRevisionPlan)
        : (await import('./specificationSessionPool')).prepareSpecificationSessionPool(
            course,
            source,
            selection,
            { ...poolRequest, requestSpecificationPointId },
            activeRevisionPlan,
          );
    cards = prepared.cards;
    const { examDateContext } = prepared;
    const schedulingUnit = (await getSchedulingUnit(course.id)) ?? course;
    const practiceConfig: SessionSchedulingConfig = {
      ...schedulingUnit,
      // Introductions have already rationed new cards for traditional courses.
      // Direct-FSRS courses need the scheduler to enforce the same course-wide cap.
      newCardsPerDay:
        course.learnFirst === false || catchUpPractice ? schedulingUnit.newCardsPerDay : undefined,
    };
    if (course.learnFirst === false && !plannedRevision && !standaloneSimple) {
      cards = studyPool(cards, practiceConfig, Date.now(), undefined, allCards);
    }
    units = [course];
    sessionUnits = [
      {
        config: practiceConfig,
        scope: { kind: 'course', courseId },
        examDateContext,
      },
    ];
    result.reviewKind = 'course';
    if (!standaloneSimple) result.ratchetCourseId = course.id;
    result.unitDisplayName = prepared.scopeTitle ?? selectedAssessment?.name ?? course.name;
    // The milestone is measured against the node's fixed lesson prefix, exactly as
    // the study-flow snapshot checks it; the wider live pool above is only what is
    // studied. Without a prefix there is no safe fingerprint, so nothing is recorded.
    if (practiceNodeKeyParam && requestMilestoneLessonIds) {
      const milestoneScope = practiceCardScope(
        allCards,
        courseLinks,
        courseExposures,
        {
          reachedLessonIds: new Set(requestMilestoneLessonIds),
          practiceNode,
          requireExposure: course.learnFirst !== false,
        },
        Date.now(),
        course.leechThreshold,
      );
      result.practiceSession = {
        nodeKey: practiceNodeKeyParam,
        courseId,
        scopeVersion: practiceScopeVersion(milestoneScope),
        scopeCards: milestoneScope,
        course,
        examDateContext,
      };
    }
  } else {
    const source = await loadGlobalSessionSource();
    units = source.schedulingUnits;
    sessionUnits = source.sessionUnits;
    cards = source.cards;
  }
  return { ...result, units, sessionUnits, cards, firstStudyLessonId, firstStudyLessonName };
}
