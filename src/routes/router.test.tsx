import { expect, it } from 'vitest';
import { router } from './router';

it('does not register the removed share prototype route', () => {
  const appRoutes = router.routes[0]?.children?.[0]?.children ?? [];
  expect(appRoutes.map((route) => route.path)).not.toContain('share-prototype');
});
