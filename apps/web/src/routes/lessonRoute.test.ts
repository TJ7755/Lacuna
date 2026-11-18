import { render, screen } from '@testing-library/react';
import { createElement, Suspense } from 'react';
import { expect, it, vi } from 'vitest';

vi.mock('../pages/LessonView', () => ({
  LessonView: () => createElement('h1', null, 'Lesson ready'),
}));

import { loadLessonView as registryLoader } from './loaders';
import { loadLessonView } from './lessonRoute';
import { lazyRouteModule, loadRouteModule } from './routeModule';

it('renders the lesson warmed by the course path immediately through the route registry', async () => {
  await loadRouteModule(loadLessonView);
  const Lesson = lazyRouteModule(registryLoader);
  render(createElement(Suspense, { fallback: 'Loading lesson' }, createElement(Lesson)));

  expect(screen.getByRole('heading', { name: 'Lesson ready' })).toBeInTheDocument();
  expect(screen.queryByText('Loading lesson')).not.toBeInTheDocument();
});
