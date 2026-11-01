import type { CardFilter } from '@lacuna/core/db/search';
import type { ReviewSessionKind } from '@lacuna/core/db/types';

/** The distinct visual identity of the current learn session. */
export type LearnModeType =
  | 'early-review'
  | 'fsrs'
  | 'simple'
  | 'cram'
  | 'filtered'
  | 'filtered-due'
  | 'filtered-new'
  | 'filtered-leech'
  | 'filtered-flagged'
  | 'filtered-suspended';

export type LearnSessionRequest =
  | { kind: 'lesson'; lessonId: string }
  | {
      kind: 'practice';
      courseId: string;
      nodeKey?: string;
      /** Current curricular session scope; omitted for due review. */
      scopeLessonIds?: string[];
      /** Fixed lesson prefix the node's milestone is measured and persisted against. */
      milestoneLessonIds?: string[];
      reviewLimit?: number;
      /** Additional authored boundary; it can only narrow ordinary practice eligibility. */
      specificationPointId?: string;
      mode: 'curricular' | 'recurring' | 'exam' | 'catch-up' | 'early-review';
      assessmentId?: never;
    }
  | {
      kind: 'practice';
      courseId: string;
      mode: 'assessment';
      assessmentId: string;
      planId?: string;
      windowId?: string;
      reviewLimit?: number;
      specificationPointId?: string;
    };

interface LearnSessionRoute {
  courseId?: string;
  lessonId?: string;
}

/** Request identifiers replace only the matching route scope. */
export function resolveLearnSessionIds(
  request: LearnSessionRequest | undefined,
  route: LearnSessionRoute,
) {
  return {
    courseId: request?.kind === 'practice' ? request.courseId : route.courseId,
    lessonId: request?.kind === 'lesson' ? request.lessonId : route.lessonId,
  };
}

interface LearnSessionRequestInput {
  request?: LearnSessionRequest;
  route: LearnSessionRoute;
  searchParams: URLSearchParams;
  studyMode: 'fsrs' | 'simple';
  lessonLearnFirst: boolean | undefined;
}

/** Interpret authored requests, route queries and study preferences in one place. */
export function resolveLearnSessionRequest({
  request,
  route,
  searchParams,
  studyMode,
  lessonLearnFirst,
}: LearnSessionRequestInput) {
  const { courseId, lessonId } = resolveLearnSessionIds(request, route);
  const tagFilter = searchParams.get('tag');
  const simpleModeParam = searchParams.get('mode') === 'simple';
  const standaloneSimple = !request && simpleModeParam;
  const practiceNodeKeyParam =
    request?.kind === 'practice' && request.mode === 'curricular'
      ? (request.nodeKey ?? null)
      : searchParams.get('practiceNode');
  const requestScopeLessonIds =
    request?.kind === 'practice' && request.mode !== 'assessment'
      ? request.scopeLessonIds
      : undefined;
  const requestMilestoneLessonIds =
    request?.kind === 'practice' && request.mode === 'curricular'
      ? request.milestoneLessonIds
      : undefined;
  const requestAssessmentId =
    request?.kind === 'practice' && request.mode === 'assessment'
      ? request.assessmentId
      : undefined;
  const requestPlanId =
    request?.kind === 'practice' && request.mode === 'assessment' ? request.planId : undefined;
  const requestWindowId =
    request?.kind === 'practice' && request.mode === 'assessment' ? request.windowId : undefined;
  const plannedRevision = Boolean(requestAssessmentId && requestPlanId && requestWindowId);
  const reviewSessionKind: ReviewSessionKind = requestAssessmentId
    ? 'assessment-revision'
    : lessonId
      ? 'lesson'
      : courseId
        ? 'practice'
        : 'deck';
  const dueReviewRequest = request?.kind === 'practice' && request.mode === 'recurring';
  const filters = searchParams.getAll('filter') as CardFilter[];
  const filterParams =
    dueReviewRequest && !filters.includes('due') ? [...filters, 'due' as const] : filters;
  // Course lessons follow their introduction setting; the global preference remains
  // available for ad-hoc deck/global sessions. Bounded point practice uses scheduled
  // reviews rather than cumulative recitation.
  const isSimpleMode =
    standaloneSimple ||
    (lessonId
      ? lessonLearnFirst !== false
      : dueReviewRequest ||
          (request?.kind === 'practice' &&
            (request.specificationPointId !== undefined ||
              request.mode === 'early-review' ||
              request.mode === 'exam' ||
              request.mode === 'catch-up'))
        ? false
        : studyMode === 'simple');

  let mode: LearnModeType = 'fsrs';
  if (isSimpleMode) mode = 'simple';
  else if (request?.kind === 'practice' && request.mode === 'early-review') mode = 'early-review';
  else if (plannedRevision) mode = 'cram';
  else if (filterParams.length > 0) {
    mode = 'filtered';
    if (filterParams.length === 1) {
      const filter = filterParams[0];
      if (filter === 'due') mode = 'filtered-due';
      if (filter === 'new') mode = 'filtered-new';
      if (filter === 'leech') mode = 'filtered-leech';
      if (filter === 'flagged') mode = 'filtered-flagged';
      if (filter === 'suspended') mode = 'filtered-suspended';
    }
  }

  return {
    courseId,
    lessonId,
    tagFilter,
    filterParams,
    requestScopeLessonIds,
    requestSpecificationPointId:
      request?.kind === 'practice' ? request.specificationPointId : undefined,
    requestMilestoneLessonIds,
    requestReviewLimit: request?.kind === 'practice' ? request.reviewLimit : undefined,
    practiceNodeKeyParam,
    requestAssessmentId,
    requestPlanId,
    requestWindowId,
    plannedRevision,
    reviewSessionKind,
    isSimpleMode,
    standaloneSimple,
    earlyReview: request?.kind === 'practice' && request.mode === 'early-review',
    examPractice: request?.kind === 'practice' && request.mode === 'exam',
    catchUpPractice: request?.kind === 'practice' && request.mode === 'catch-up',
    mode,
  };
}
