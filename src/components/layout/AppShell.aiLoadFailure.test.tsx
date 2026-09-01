import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { createInMemoryAiSession } from '../../ai/session/inMemory';
import { AppShell } from './AppShell';

const aiSession = vi.hoisted(() => ({ current: null as ReturnType<typeof createInMemoryAiSession> | null }));

vi.mock('./Sidebar', () => ({
  Sidebar: ({
    collapsed,
    aiAction,
  }: {
    collapsed: boolean;
    aiAction?: { onClick: () => void; triggerRef: React.RefObject<HTMLButtonElement> };
  }) => (
    <aside data-collapsed={collapsed || undefined}>
      {aiAction && (
        <button ref={aiAction.triggerRef} type="button" onClick={aiAction.onClick}>
          AI
        </button>
      )}
    </aside>
  ),
}));
vi.mock('./Titlebar', () => ({ Titlebar: () => null }));
vi.mock('../course/FinalExamLifecycleController', () => ({
  FinalExamLifecycleController: () => null,
}));
vi.mock('../search/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../learn/StudySheet', () => ({ StudySheet: () => null }));
vi.mock('../course/CourseSectionBar', () => ({ CourseSectionBar: () => null }));
vi.mock('../ui/KeyHints', () => ({ KeyHints: () => null }));
vi.mock('./LandingTransition', () => ({ consumeLandingArrival: () => false }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
  getMotionMultiplier: () => 0,
}));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../ai/settings', () => ({
  useAiSettings: () => [{ enabled: true, misconceptionFirstEnabled: true }, vi.fn()],
}));
vi.mock('../../ai/session/AiSessionContext', () => ({
  useOptionalAiSession: () => aiSession.current,
}));
vi.mock('../ai/loaders', () => ({
  loadAiPanel: () => Promise.reject(new Error('AI panel chunk unavailable')),
}));

beforeEach(() => {
  aiSession.current = createInMemoryAiSession();
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches:
      query === '(min-width: 1024px)' ||
      query === '(min-width: 1280px)' ||
      query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
});

it('contains a rejected AI panel import and lets the learner close it', async () => {
  const originalError = console.error;
  const error = vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (
      !args.some(
        (argument) =>
          typeof argument === 'string' &&
          (argument.includes('AiPanelLoadBoundary') ||
            argument.includes('AI panel chunk unavailable')),
      )
    ) {
      originalError(...args);
    }
  });

  try {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<h1>Dashboard</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: 'AI' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(await screen.findByRole('alert')).toHaveTextContent('AI could not load');
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(error).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close AI' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  } finally {
    error.mockRestore();
  }
});
