import { expect, it, vi } from 'vitest';

vi.mock('../pages/LessonView', () => ({ LessonView: () => null }));

import { loadLessonView as registryLoader } from './loaders';
import { loadLessonView, prefetchLessonView } from './lessonRoute';
import { getLoadedRouteModule, loadRouteModule } from './routeModule';

it('shares the same lesson loader and completed module across idle prefetch and navigation', async () => {
  expect(registryLoader).toBe(loadLessonView);
  expect(getLoadedRouteModule(registryLoader)).toBeUndefined();
  prefetchLessonView();
  const loaded = await loadRouteModule(registryLoader);
  expect(getLoadedRouteModule(loadLessonView)).toBe(loaded);
  expect(await loadRouteModule(loadLessonView)).toBe(loaded);
});
