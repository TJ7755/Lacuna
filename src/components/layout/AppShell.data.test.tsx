import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../../db/repository';
import { db } from '../../db/schema';
import { useCourseDashboardData, useSidebarData } from '../../state/useCourseData';
import { ToastProvider } from '../ui/Toast';
import { AppShell } from './AppShell';

// Keep the real shell, routing and data consumers; omit unrelated overlay controls.
vi.mock('./Sidebar', () => ({
  Sidebar: () => {
    const data = useSidebarData();
    return (
      <output data-testid="sidebar-count">{data?.summaries[data.courses[0]?.id]?.cardCount}</output>
    );
  },
}));
vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('./Titlebar', () => ({ Titlebar: () => null }));
vi.mock('../search/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../learn/StudySheet', () => ({ StudySheet: () => null }));
vi.mock('../ui/KeyHints', () => ({ KeyHints: () => null }));
vi.mock('./LandingTransition', () => ({ consumeLandingArrival: () => false }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => 0,
}));
vi.mock('../../ai/settings', () => ({ useAiSettings: () => [{ enabled: false }] }));
vi.mock('../../ai/session/AiSessionContext', () => ({ useOptionalAiSession: () => null }));

function DashboardData() {
  const data = useCourseDashboardData();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="dashboard-count">{data?.allCards.length}</output>
      <button onClick={() => navigate('/settings')}>Settings</button>
    </>
  );
}

function renderShell() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<DashboardData />} />
            <Route path="settings" element={<h1>Settings</h1>} />
          </Route>
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  const course = await createCourse('Biology');
  await createCourseCard(course.id, 'front_back', 'Cell', 'Unit of life');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});

it('shares one cards and history read across the dashboard and both navigation surfaces', async () => {
  const cards = vi.spyOn(db.cards, 'toArray');
  const history = vi.spyOn(db.reviewHistory, 'where');
  const assessments = vi.spyOn(db.courseAssessments, 'toArray');
  const courseOrdering = vi.spyOn(db.courses, 'orderBy');
  const view = renderShell();
  await waitFor(() => expect(screen.getByTestId('dashboard-count')).toHaveTextContent('1'));
  await waitFor(() => expect(screen.getByTestId('sidebar-count')).toHaveTextContent('1'));
  expect(cards).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledTimes(1);
  expect(assessments).toHaveBeenCalledTimes(1);
  expect(courseOrdering).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  await waitFor(() => expect(screen.getAllByTestId('sidebar-count')).toHaveLength(2));
  for (const sidebar of screen.getAllByTestId('sidebar-count'))
    expect(sidebar).toHaveTextContent('1');
  expect(cards).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledTimes(1);
  expect(assessments).toHaveBeenCalledTimes(1);
  expect(courseOrdering).not.toHaveBeenCalled();

  cards.mockClear();
  history.mockClear();
  assessments.mockClear();
  await act(async () => {
    const course = (await db.courses.toArray())[0];
    await createCourseCard(course.id, 'front_back', 'Nucleus', 'Contains DNA');
  });
  await waitFor(() => expect(screen.getByTestId('dashboard-count')).toHaveTextContent('2'));
  for (const sidebar of screen.getAllByTestId('sidebar-count'))
    expect(sidebar).toHaveTextContent('2');
  expect(cards).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledTimes(1);
  expect(assessments).toHaveBeenCalledTimes(1);
  expect(courseOrdering).not.toHaveBeenCalled();
  view.unmount();
});

it('drops dashboard subscriptions on navigation and all subscriptions on unmount', async () => {
  const cards = vi.spyOn(db.cards, 'toArray');
  const supplements = vi.spyOn(db.coursePerformance, 'toArray');
  const view = renderShell();
  await waitFor(() => expect(screen.getByTestId('dashboard-count')).toHaveTextContent('1'));
  expect(supplements).toHaveBeenCalledTimes(1);

  const course = (await db.courses.toArray())[0];
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  await screen.findByRole('heading', { name: 'Settings' });
  // A card write proves the new navigation-only query has delivered its result.
  await act(async () => {
    await createCourseCard(course.id, 'front_back', 'Nucleus', 'Contains DNA');
  });
  await waitFor(() => expect(screen.getByTestId('sidebar-count')).toHaveTextContent('2'));
  cards.mockClear();
  supplements.mockClear();
  await act(async () => {
    await db.coursePerformance.update(course.id, { runningMeanResponseTime: 25 });
    // Dexie batches live-query notifications before scheduling the next read.
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  expect(cards).not.toHaveBeenCalled();
  expect(supplements).not.toHaveBeenCalled();

  view.unmount();
  await act(async () => {
    await db.cards.clear();
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  expect(cards).not.toHaveBeenCalled();
});
