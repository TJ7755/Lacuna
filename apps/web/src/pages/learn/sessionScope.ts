import type { CardFilter } from '../../db/search';
import type { SimpleSessionScope } from './simpleSessionPersistence';

export interface LearnSessionScopeInput {
  courseId: string | undefined;
  lessonId: string | undefined;
  sessionId: string | undefined;
  tagFilter: string | null;
  filterParams: CardFilter[];
  requestScopeLessonIds: string[] | undefined;
  practiceNodeKey: string | null;
  assessmentId: string | undefined;
  planId: string | undefined;
  windowId: string | undefined;
}

export interface LearnSessionScope {
  isLessonScoped: boolean;
  isCourseScoped: boolean;
  isGlobal: boolean;
  requestScopeLessonIdsKey: string | undefined;
  filterParamsKey: string;
  simpleSessionScope: SimpleSessionScope;
}

/** Resolve route inputs into the stable identity shared by loading and Simple resume. */
export function resolveLearnSessionScope(input: LearnSessionScopeInput): LearnSessionScope {
  const isLessonScoped = Boolean(input.lessonId);
  const isCourseScoped = Boolean(input.courseId) && !isLessonScoped;
  const isGlobal = !isLessonScoped && !isCourseScoped;
  const requestScopeLessonIdsKey = input.requestScopeLessonIds?.join('\0');
  const filterParamsKey = input.filterParams.join('\0');

  let simpleSessionScope: SimpleSessionScope;
  if (input.lessonId) {
    simpleSessionScope = { kind: 'lesson', lessonId: input.lessonId };
  } else if (
    input.courseId &&
    (input.sessionId ||
      input.practiceNodeKey ||
      requestScopeLessonIdsKey !== undefined ||
      input.assessmentId ||
      input.planId ||
      input.windowId)
  ) {
    simpleSessionScope = {
      kind: 'practice',
      courseId: input.courseId,
      sessionId: input.sessionId,
      nodeKey: input.practiceNodeKey ?? undefined,
      lessonIds: input.requestScopeLessonIds,
      assessmentId: input.assessmentId,
      planId: input.planId,
      windowId: input.windowId,
    };
  } else if (input.courseId) {
    simpleSessionScope = {
      kind: 'course',
      courseId: input.courseId,
      filters: input.filterParams,
      tag: input.tagFilter ?? undefined,
    };
  } else {
    simpleSessionScope = {
      kind: 'global',
      filters: input.filterParams,
      tag: input.tagFilter ?? undefined,
    };
  }

  return {
    isLessonScoped,
    isCourseScoped,
    isGlobal,
    requestScopeLessonIdsKey,
    filterParamsKey,
    simpleSessionScope,
  };
}
