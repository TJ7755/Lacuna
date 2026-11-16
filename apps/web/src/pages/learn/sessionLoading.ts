import { loadSessionData } from './loadSessionData';
import { loadSessionSource, type LoadedSessionSource } from './loadSessionSource';
import type { SimpleSessionScope } from './simpleSessionPersistence';
import type { UseLearnSessionParams } from './useLearnSession';

interface SessionLoadTarget {
  source(source: LoadedSessionSource): void;
  ready(
    source: LoadedSessionSource,
    data: Awaited<ReturnType<typeof loadSessionData>>,
    markLoad: (stage: string) => void,
  ): void;
  redirect(path: string): void;
}

/** Owns the cancellable source/metadata pipeline and its startup measurements. */
export function startSessionLoad(
  options: UseLearnSessionParams,
  scope: { isGlobal: boolean; simpleSessionScope: SimpleSessionScope },
  target: SessionLoadTarget,
): () => void {
  let cancelled = false;
  void (async () => {
    const measureStartup = performance.getEntriesByName('lacuna:measure-study-startup').length > 0;
    const markLoad = (stage: string) => {
      if (measureStartup) performance.mark(`lacuna:study-load:${stage}`);
    };
    markLoad('load-start');
    const source = await loadSessionSource({
      lessonId: options.lessonId,
      courseId: options.courseId,
      standaloneSimple: options.standaloneSimple ?? false,
      requestScopeLessonIds: options.requestScopeLessonIds,
      requestSpecificationPointId: options.requestSpecificationPointId,
      practiceNodeKeyParam: options.practiceNodeKeyParam,
      requestAssessmentId: options.requestAssessmentId,
      filterParams: options.filterParams,
      examPractice: options.examPractice ?? false,
      catchUpPractice: options.catchUpPractice ?? false,
      plannedRevision: options.plannedRevision,
      requestPlanId: options.requestPlanId,
      requestWindowId: options.requestWindowId,
      requestMilestoneLessonIds: options.requestMilestoneLessonIds,
    });
    if (cancelled) return;
    if ('redirect' in source) {
      target.redirect(source.redirect);
      return;
    }
    target.source(source);
    if (cancelled) return;
    markLoad('pool-ready');
    const data = await loadSessionData({
      source,
      tagFilter: options.tagFilter,
      filterParams: options.filterParams,
      lessonId: options.lessonId,
      plannedRevision: options.plannedRevision,
      isSimpleMode: options.isSimpleMode,
      introduceNewCards: options.introduceNewCards ?? false,
      isGlobal: scope.isGlobal,
      mode: options.mode,
      simpleSessionScope: scope.simpleSessionScope,
      markLoad,
    });
    if (!cancelled) target.ready(source, data, markLoad);
  })();
  return () => {
    cancelled = true;
  };
}
