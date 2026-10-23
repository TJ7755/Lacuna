import { loadRouteModule } from './routeModule';

export const loadLessonView = () =>
  import('../pages/LessonView').then((module) => ({ default: module.LessonView }));

/** Share the lesson module cache with route navigation and intent prefetches. */
export function prefetchLessonView(): void {
  void loadRouteModule(loadLessonView).catch(() => {
    // Speculative failures must leave navigation free to retry.
  });
}
