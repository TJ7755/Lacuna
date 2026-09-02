import {
  loadAnalytics,
  loadArchivedCourses,
  loadCardsPage,
  loadCourseAnalytics,
  loadCoursePath,
  loadCourseSettings,
  loadHelpPage,
  loadLessonView,
  loadQuestionsPage,
  loadSearchPage,
  loadSettings,
  loadSharePage,
} from './loaders';

type RouteLoader = () => Promise<unknown>;

const PREFETCH_LOADERS: Partial<Record<string, RouteLoader>> = {
  '/analytics': loadAnalytics,
  '/archived': loadArchivedCourses,
  '/help': loadHelpPage,
  '/search': loadSearchPage,
  '/settings': loadSettings,
  '/share': loadSharePage,
};

const COURSE_PREFETCH_LOADERS: Array<{
  key: string;
  pattern: RegExp;
  loader: RouteLoader;
}> = [
  { key: 'course-path', pattern: /^\/course\/[^/]+\/?$/, loader: loadCoursePath },
  {
    key: 'course-lesson',
    pattern: /^\/course\/[^/]+\/lesson\/[^/]+\/?$/,
    loader: loadLessonView,
  },
  { key: 'course-cards', pattern: /^\/course\/[^/]+\/cards\/?$/, loader: loadCardsPage },
  {
    key: 'course-questions',
    pattern: /^\/course\/[^/]+\/questions\/?$/,
    loader: loadQuestionsPage,
  },
  {
    key: 'course-analytics',
    pattern: /^\/course\/[^/]+\/analytics\/?$/,
    loader: loadCourseAnalytics,
  },
  {
    key: 'course-settings',
    pattern: /^\/course\/[^/]+\/settings\/?$/,
    loader: loadCourseSettings,
  },
];

const prefetchedRoutes = new Set<string>();

function prefetchTarget(path: string): { key: string; loader: RouteLoader } | undefined {
  const normalised = path.split('?')[0].split('#')[0];
  if (normalised.startsWith('/course/')) {
    const match = COURSE_PREFETCH_LOADERS.find(({ pattern }) => pattern.test(normalised));
    return match ? { key: match.key, loader: match.loader } : undefined;
  }
  const loader = PREFETCH_LOADERS[normalised];
  return loader ? { key: normalised, loader } : undefined;
}

/** Start loading a route chunk while the user is hovering, focusing or pressing its link. */
export function prefetchRoute(path: string): void {
  const target = prefetchTarget(path);
  if (!target || prefetchedRoutes.has(target.key)) return;
  const { key, loader } = target;
  prefetchedRoutes.add(key);
  void loader().catch(() => {
    // A later navigation should be allowed to retry a failed prefetch.
    prefetchedRoutes.delete(key);
  });
}
