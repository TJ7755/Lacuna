import { expect, it, vi } from 'vitest';

vi.mock('../pages/LessonView', () => ({ LessonView: () => null }));

import { loadLessonView as registryLoader } from './loaders';
import { loadLessonView } from './lessonRoute';
import { getLoadedRouteModule, loadRouteModule } from './routeModule';

it('shares the same lesson loader and completed module across the leaf owner and route registry', async () => {
  expect(registryLoader).toBe(loadLessonView);
  expect(getLoadedRouteModule(registryLoader)).toBeUndefined();
  const prefetched = loadRouteModule(loadLessonView);
  expect(loadRouteModule(registryLoader)).toBe(prefetched);
  const loaded = await prefetched;
  expect(getLoadedRouteModule(loadLessonView)).toBe(loaded);
  expect(await loadRouteModule(loadLessonView)).toBe(loaded);
});
