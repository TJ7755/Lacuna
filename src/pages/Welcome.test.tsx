import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createHashRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SharePage } from './SharePage';
import { Welcome } from './Welcome';

vi.mock('../hooks/useRevealOnScroll', () => ({
  useRevealOnScroll: () => ({ ref: { current: null }, visible: true }),
}));

vi.mock('../components/welcome/GradingDemo', () => ({
  GradingDemo: () => null,
}));
vi.mock('../components/welcome/DashboardMock', () => ({
  DashboardMock: () => null,
  mockPredictedScore: () => 80,
}));
vi.mock('../components/welcome/ExamCurve', () => ({
  ExamCurve: () => null,
}));
vi.mock('../components/welcome/PathDemo', () => ({
  PathDemo: () => null,
}));
vi.mock('../components/welcome/PracticeDeck', () => ({
  PracticeDeck: () => null,
}));
vi.mock('../components/welcome/LandingCta', () => ({
  LandingCta: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('../components/welcome/useSmoothScroll', () => ({
  useSmoothScroll: () => undefined,
}));
vi.mock('../state/useCourseData', () => ({
  useCourses: () => [],
  useCourseSummaries: () => ({}),
  useCourseCards: () => [],
  useCourse: () => null,
}));
vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));
vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));
vi.mock('../db/repository', () => ({
  publishCourse: vi.fn(),
}));

describe('Welcome import entry points', () => {
  it('sends both current-facing import links to the shared-course importer', () => {
    render(<Welcome />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: 'Skip to the checkpoint' }));

    const links = screen.getAllByRole('link', { name: 'Import a shared course' });
    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/share?intent=import'));
    expect(screen.queryByText(/import a deck/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/import anki \/ json/i)).not.toBeInTheDocument();
  });

  it('preserves import intent through the production hash router', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    window.location.hash = '#/welcome';
    const router = createHashRouter([
      { path: '/welcome', element: <Welcome /> },
      { path: '/share', element: <SharePage /> },
    ]);

    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getAllByRole('link', { name: 'Import a shared course' })[0]);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/share');
      expect(router.state.location.search).toBe('?intent=import');
    });
    const importInput = screen.getByRole('textbox', { name: 'Share code to import' });
    await waitFor(() => expect(importInput).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    router.dispose();
  });
});
