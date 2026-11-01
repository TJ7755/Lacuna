import {
  loadCardEditor,
  loadSequenceEditor,
  loadOcclusionEditor,
  loadQuestionEditor,
  loadQuestionSetEditor,
  loadQuestionSetOverview,
  loadQuestionSetPractice,
  loadQuestionLearnMode,
  loadLearnMode,
  loadMergeReviewPanel,
  loadTeacherHome,
  loadShareLinkPage,
  loadLanding,
  loadDownload,
  loadMethod,
  loadAnalytics,
  loadArchivedCourses,
  loadCardsPage,
  loadCourseAnalytics,
  loadCourseStudyFlow,
  loadCoursePath,
  loadCourseSettings,
  loadHelpPage,
  loadImportPanel,
  loadLessonView,
  loadQuestionsPage,
  loadSearchPage,
  loadSettings,
  loadSharePage,
  loadPupilClassPage,
} from './loaders';

import { loadRouteModule, loadRouteModuleForNavigation, type RouteLoader } from './routeModule';

const PREFETCH_LOADERS: Partial<Record<string, RouteLoader>> = {
  '/analytics': loadAnalytics,
  '/teach': loadTeacherHome,
  '/learn': loadLearnMode,
  '/welcome': loadLanding,
  '/landing': loadLanding,
  '/download': loadDownload,
  '/method': loadMethod,
  '/archived': loadArchivedCourses,
  '/help': loadHelpPage,
  '/import': loadImportPanel,
  '/search': loadSearchPage,
  '/settings': loadSettings,
  '/share': loadSharePage,
};

const COURSE_PREFETCH_LOADERS: Array<{
  pattern: RegExp;
  loader: RouteLoader;
}> = [
  { pattern: /^\/course\/[^/]+\/questions\/learn\/?$/, loader: loadQuestionLearnMode },
  { pattern: /^\/course\/[^/]+\/learn\/?$/, loader: loadLearnMode },
  { pattern: /^\/course\/[^/]+\/question-sets\/[^/]+\/edit\/?$/, loader: loadQuestionSetEditor },
  {
    pattern: /^\/course\/[^/]+\/question-sets\/[^/]+\/attempts\/[^/]+\/?$/,
    loader: loadQuestionSetPractice,
  },
  { pattern: /^\/course\/[^/]+\/question-sets\/[^/]+\/?$/, loader: loadQuestionSetOverview },
  { pattern: /^\/course\/[^/]+\/questions\/(?:new|[^/]+\/edit)\/?$/, loader: loadQuestionEditor },
  {
    pattern: /^\/course\/[^/]+(?:\/lesson\/[^/]+)?\/cards\/(?:new|[^/]+\/edit)\/?$/,
    loader: loadCardEditor,
  },
  {
    pattern: /^\/course\/[^/]+(?:\/lesson\/[^/]+)?\/sequence\/(?:new|[^/]+\/edit)\/?$/,
    loader: loadSequenceEditor,
  },
  {
    pattern: /^\/course\/[^/]+(?:\/lesson\/[^/]+)?\/occlusion\/(?:new|[^/]+\/edit)\/?$/,
    loader: loadOcclusionEditor,
  },
  { pattern: /^\/course\/[^/]+\/updates\/?$/, loader: loadMergeReviewPanel },
  { pattern: /^\/course\/[^/]+\/study\/?$/, loader: loadCourseStudyFlow },
  { pattern: /^\/course\/[^/]+\/?$/, loader: loadCoursePath },
  {
    pattern: /^\/course\/[^/]+\/lesson\/[^/]+\/?$/,
    loader: loadLessonView,
  },
  { pattern: /^\/course\/[^/]+\/cards\/?$/, loader: loadCardsPage },
  {
    pattern: /^\/course\/[^/]+\/questions\/?$/,
    loader: loadQuestionsPage,
  },
  {
    pattern: /^\/course\/[^/]+\/analytics\/?$/,
    loader: loadCourseAnalytics,
  },
  {
    pattern: /^\/course\/[^/]+\/settings\/?$/,
    loader: loadCourseSettings,
  },
];

function prefetchTarget(path: string): { loader: RouteLoader; dataKey?: string } | undefined {
  const normalised = path.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  if (/^\/gaps\/[^/]+$/.test(normalised)) return { loader: loadPupilClassPage };
  if (/^\/s\/[^/]+$/.test(normalised)) return { loader: loadShareLinkPage };
  if (/^\/lesson\/[^/]+\/learn$/.test(normalised)) return { loader: loadLearnMode };
  if (normalised.startsWith('/course/')) {
    const match = COURSE_PREFETCH_LOADERS.find(({ pattern }) => pattern.test(normalised));
    if (!match) return;
    return {
      loader: match.loader,
      dataKey:
        match.loader === loadCoursePath ? decodeURIComponent(normalised.split('/')[2]) : undefined,
    };
  }
  const loader = Object.hasOwn(PREFETCH_LOADERS, normalised)
    ? PREFETCH_LOADERS[normalised]
    : undefined;
  return loader ? { loader } : undefined;
}

/** Keep the existing outlet until its destination chunk and supported local reads are ready. */
async function prepareTarget(
  path: string,
  source: 'intent' | 'navigation',
  signal?: AbortSignal,
): Promise<null> {
  try {
    const target = prefetchTarget(path);
    if (!target || signal?.aborted) return null;
    const module = await (source === 'navigation'
      ? loadRouteModuleForNavigation(target.loader, signal)
      : loadRouteModule(target.loader));
    if (!signal?.aborted && target.dataKey) await module.preload?.(target.dataKey);
  } catch {
    // Speculation must be retryable. Navigation leaves import recovery and query
    // errors with their existing React owners rather than the router error page.
  }
  return null;
}

export function prepareRoute(path: string, signal?: AbortSignal): Promise<null> {
  return prepareTarget(path, 'navigation', signal);
}

/** Start bounded route work while the user is hovering, focusing or pressing its link. */
export function prefetchRoute(path: string): void {
  void prepareTarget(path, 'intent');
}
