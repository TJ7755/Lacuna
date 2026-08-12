import {
  loadAnalytics,
  loadCoursePath,
  loadHelpPage,
  loadLessonView,
  loadSearchPage,
  loadSettings,
  loadSharePage,
} from './loaders';

type RouteLoader = () => Promise<unknown>;

const PREFETCH_LOADERS: Record<string, RouteLoader> = {
  '/analytics': loadAnalytics,
  '/help': loadHelpPage,
  '/search': loadSearchPage,
  '/settings': loadSettings,
  '/share': loadSharePage,
};

const prefetchedRoutes = new Set<string>();

function routeChunkKey(path: string): string | null {
  const normalised = path.split('?')[0].split('#')[0];
  if (normalised.startsWith('/course/')) {
    return normalised.includes('/lesson/') ? 'course-lesson' : 'course-path';
  }
  return PREFETCH_LOADERS[normalised] ? normalised : null;
}

function loaderForRoute(path: string): RouteLoader | undefined {
  const normalised = path.split('?')[0].split('#')[0];
  if (normalised.startsWith('/course/')) {
    return normalised.includes('/lesson/') ? loadLessonView : loadCoursePath;
  }
  return PREFETCH_LOADERS[normalised];
}

/** Start loading a route chunk while the user is hovering, focusing or pressing its link. */
export function prefetchRoute(path: string): void {
  const key = routeChunkKey(path);
  const loader = loaderForRoute(path);
  if (!key || !loader || prefetchedRoutes.has(key)) return;
  prefetchedRoutes.add(key);
  void loader().catch(() => {
    // A later navigation should be allowed to retry a failed prefetch.
    prefetchedRoutes.delete(key);
  });
}
