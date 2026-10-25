import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import type { RouteLoader } from './routeModule';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';

const loaders = vi.hoisted(() => ({
  loadCardEditor: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadSequenceEditor: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadOcclusionEditor: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadQuestionEditor: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadQuestionSetEditor: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadQuestionSetOverview: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadQuestionSetPractice: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadQuestionLearnMode: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadLearnMode: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadMergeReviewPanel: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadTeacherHome: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadShareLinkPage: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadLanding: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadDownload: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadMethod: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),

  loadAnalytics: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadArchivedCourses: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadCardsPage: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadCourseStudyFlow: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadCourseAnalytics: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadCoursePath: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadCourseSettings: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadImportPanel: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadHelpPage: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadLessonView: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadQuestionsPage: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadSearchPage: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadSettings: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadSharePage: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
  loadPupilClassPage: vi.fn<RouteLoader>(() => Promise.resolve({ default: () => null })),
}));

vi.mock('./loaders', () => loaders);

const recoverFromChunkFailure = vi.hoisted(() => vi.fn(async () => false));
vi.mock('../pwa/staleChunkRecovery', () => ({ recoverFromChunkFailure }));

beforeEach(() => {
  vi.resetModules();
  for (const loader of Object.values(loaders)) {
    loader.mockReset();
    loader.mockResolvedValue({ default: () => null });
  }
  recoverFromChunkFailure.mockClear();
});

describe('prefetchRoute', () => {
  it.each(['__proto__', 'constructor', 'toString'])(
    'ignores inherited route names: %s',
    async (path) => {
      const { prefetchRoute } = await import('./prefetch');
      expect(() => prefetchRoute(path)).not.toThrow();
    },
  );

  it.each([
    ['/course/one/cards/new', 'loadCardEditor'],
    ['/course/one/lesson/two/cards/three/edit', 'loadCardEditor'],
    ['/course/one/questions/new', 'loadQuestionEditor'],
    ['/course/one/questions/two/edit', 'loadQuestionEditor'],
    ['/course/one/sequence/new', 'loadSequenceEditor'],
    ['/course/one/lesson/two/sequence/new', 'loadSequenceEditor'],
    ['/course/one/occlusion/two/edit', 'loadOcclusionEditor'],
    ['/course/one/question-sets/two/edit', 'loadQuestionSetEditor'],
    ['/course/one/question-sets/two', 'loadQuestionSetOverview'],
    ['/course/one/question-sets/two/attempts/three', 'loadQuestionSetPractice'],
  ] as const)('warms %s for immediate rendering', async (path, name) => {
    const { prefetchRoute } = await import('./prefetch');
    const { lazyRouteModule } = await import('./routeModule');
    const loader = loaders[name];
    loader.mockResolvedValueOnce({ default: () => createElement('h1', null, 'Editor ready') });
    await act(async () => {
      prefetchRoute(path);
      prefetchRoute(path);
    });
    const Route = lazyRouteModule(loader);
    render(createElement(Suspense, { fallback: 'Loading editor' }, createElement(Route)));
    expect(screen.getByRole('heading', { name: 'Editor ready' })).toBeInTheDocument();
    expect(screen.queryByText('Loading editor')).not.toBeInTheDocument();
    expect(loader).toHaveBeenCalledOnce();
  });
});

it('keeps the current route usable until its destination is prepared and honours the latest navigation', async () => {
  const { prepareRoute } = await import('./prefetch');
  const { lazyRouteModule } = await import('./routeModule');
  let finishSettings!: (module: { default: () => ReturnType<typeof createElement> }) => void;
  loaders.loadSettings.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSettings = resolve;
      }),
  );
  loaders.loadSearchPage.mockResolvedValueOnce({
    default: () => createElement('h1', null, 'Search ready'),
  });
  const Settings = lazyRouteModule(loaders.loadSettings);
  const Search = lazyRouteModule(loaders.loadSearchPage);
  const router = createMemoryRouter([
    {
      loader: ({ request }) => prepareRoute(new URL(request.url).pathname, request.signal),
      shouldRevalidate: () => true,
      hydrateFallbackElement: null,
      errorElement: createElement('p', null, 'Router error'),
      element: createElement(Outlet),
      children: [
        { path: '/', element: createElement('button', null, 'Current route') },
        {
          path: '/settings',
          element: createElement(
            Suspense,
            { fallback: 'Loading destination' },
            createElement(Settings),
          ),
        },
        {
          path: '/search',
          element: createElement(
            Suspense,
            { fallback: 'Loading destination' },
            createElement(Search),
          ),
        },
      ],
    },
  ]);
  render(createElement(RouterProvider, { router }));
  await screen.findByRole('button', { name: 'Current route' });
  let settingsNavigation!: Promise<void>;
  await act(async () => {
    settingsNavigation = router.navigate('/settings');
  });
  expect(screen.getByRole('button', { name: 'Current route' })).toBeEnabled();
  expect(screen.queryByText('Loading destination')).not.toBeInTheDocument();
  await act(async () => {
    await router.navigate('/search');
  });
  expect(screen.getByRole('heading', { name: 'Search ready' })).toBeInTheDocument();
  await act(async () => {
    finishSettings({ default: () => createElement('h1', null, 'Settings ready') });
    await settingsNavigation;
  });
  expect(screen.getByRole('heading', { name: 'Search ready' })).toBeInTheDocument();
  await act(async () => {
    await router.navigate(-1);
  });
  expect(screen.getByRole('button', { name: 'Current route' })).toBeInTheDocument();
  await act(async () => {
    await router.navigate('/settings');
  });
  expect(screen.getByRole('heading', { name: 'Settings ready' })).toBeInTheDocument();
  expect(screen.queryByText('Loading destination')).not.toBeInTheDocument();
  router.dispose();
});

it('waits for the course path presentation read before replacing the current outlet', async () => {
  const { prepareRoute } = await import('./prefetch');
  const { lazyRouteModule } = await import('./routeModule');
  let finish!: () => void;
  const ready = new Promise<void>((resolve) => {
    finish = resolve;
  });
  loaders.loadCoursePath.mockResolvedValueOnce({
    default: () => createElement('h1', null, 'Course ready'),
    preload: () => ready,
  });
  const CoursePath = lazyRouteModule(loaders.loadCoursePath);
  const router = createMemoryRouter([
    {
      loader: ({ request }) => prepareRoute(new URL(request.url).pathname, request.signal),
      shouldRevalidate: () => true,
      hydrateFallbackElement: null,
      element: createElement(Outlet),
      children: [
        { path: '/', element: createElement('button', null, 'Current route') },
        {
          path: '/course/:courseId',
          element: createElement(
            Suspense,
            { fallback: 'Loading destination' },
            createElement(CoursePath),
          ),
        },
      ],
    },
  ]);
  render(createElement(RouterProvider, { router }));
  await screen.findByRole('button', { name: 'Current route' });
  let navigation!: Promise<void>;
  await act(async () => {
    navigation = router.navigate('/course/biology');
  });
  expect(screen.getByRole('button', { name: 'Current route' })).toBeEnabled();
  expect(screen.queryByText('Loading destination')).not.toBeInTheDocument();
  await act(async () => {
    finish();
    await navigation;
  });
  expect(screen.getByRole('heading', { name: 'Course ready' })).toBeInTheDocument();
  router.dispose();
});

it('leaves failed speculative imports with lazy route recovery rather than a fatal router error', async () => {
  const { prepareRoute } = await import('./prefetch');
  const { lazyRouteModule } = await import('./routeModule');
  loaders.loadHelpPage.mockRejectedValue(
    new TypeError('Failed to fetch dynamically imported module: /help.js'),
  );
  await prepareRoute('/help');
  expect(recoverFromChunkFailure).not.toHaveBeenCalled();
  const Help = lazyRouteModule(loaders.loadHelpPage);
  const router = createMemoryRouter(
    [
      {
        path: '/help',
        loader: ({ request }) => prepareRoute(new URL(request.url).pathname, request.signal),
        hydrateFallbackElement: null,
        errorElement: createElement('p', null, 'Fatal router error'),
        element: createElement(
          ErrorBoundary,
          null,
          createElement(Suspense, { fallback: 'Loading destination' }, createElement(Help)),
        ),
      },
    ],
    { initialEntries: ['/help'] },
  );
  const errorOutput = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(createElement(RouterProvider, { router }));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('Fatal router error')).not.toBeInTheDocument();
    expect(recoverFromChunkFailure).toHaveBeenCalledOnce();
  } finally {
    errorOutput.mockRestore();
    router.dispose();
  }
});
