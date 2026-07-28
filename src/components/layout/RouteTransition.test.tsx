import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteTransition, routeTransitionKey, routeTransitionTiming } from './RouteTransition';

function Page({ name, destination }: { name: string; destination: string }) {
  const navigate = useNavigate();
  return (
    <main>
      <h1>{name}</h1>
      <button type="button" onClick={() => navigate(destination)}>
        Navigate
      </button>
    </main>
  );
}

function renderRoutes(initialEntry: string) {
  const router = createMemoryRouter(
    [
      {
        element: <RouteTransition />,
        children: [
          { path: '/course/:courseId', element: <Page name="Course" destination="/settings" /> },
          { path: '/settings', element: <Page name="Settings" destination="/course/one/study" /> },
          {
            path: '/course/:courseId/study',
            element: <Page name="Practice" destination="/course/one" />,
          },
          { path: '/welcome', element: <Page name="Welcome" destination="/settings" /> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

describe('routeTransitionKey', () => {
  it('keeps dashboard, settings and nested course pages in the persistent shell', () => {
    expect(routeTransitionKey('/')).toBe('shell');
    expect(routeTransitionKey('/settings')).toBe('shell');
    expect(routeTransitionKey('/course/one/lesson/two')).toBe('shell');
  });

  it('gives welcome and each focused study route its own transition boundary', () => {
    expect(routeTransitionKey('/welcome')).toBe('welcome');
    expect(routeTransitionKey('/learn')).toBe('focus:/learn');
    expect(routeTransitionKey('/course/one/study')).toBe('focus:/course/one/study');
    expect(routeTransitionKey('/course/one/learn')).toBe('focus:/course/one/learn');
    expect(routeTransitionKey('/lesson/two/learn')).toBe('focus:/lesson/two/learn');
  });
});

describe('routeTransitionTiming', () => {
  it('respects speed multipliers and disables duration for reduced motion', () => {
    expect(routeTransitionTiming(1.4).duration).toBeCloseTo(0.252);
    expect(routeTransitionTiming(0.6).duration).toBeCloseTo(0.108);
    expect(routeTransitionTiming(0).duration).toBe(0);
  });
});

describe('RouteTransition', () => {
  it('updates shell routes without holding on to stale content', async () => {
    renderRoutes('/course/one');
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible());
    expect(screen.queryByRole('heading', { name: 'Course' })).not.toBeInTheDocument();
  });

  it('covers exiting a practice session to its course', async () => {
    const router = renderRoutes('/course/one/study');
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Course' })).toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/course/one');
    expect(screen.queryByRole('heading', { name: 'Practice' })).not.toBeInTheDocument();
  });

  it('covers browser history between shell and full-screen routes', async () => {
    const router = renderRoutes('/settings');
    fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Practice' })).toBeInTheDocument(),
    );
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument(),
    );
  });
});
