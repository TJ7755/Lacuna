import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { useStudySheet } from '../learn/StudySheetContext';
import { AppShell } from './AppShell';

vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./Titlebar', () => ({ Titlebar: () => null }));
vi.mock('../course/FinalExamLifecycleController', () => ({
  FinalExamLifecycleController: () => null,
}));
vi.mock('../search/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../course/CourseSectionBar', () => ({ CourseSectionBar: () => null }));
vi.mock('./LandingTransition', () => ({ consumeLandingArrival: () => false }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
  getMotionMultiplier: () => 0,
}));
vi.mock('../../ai/settings', () => ({ useAiSettings: () => [{ enabled: false }, vi.fn()] }));
vi.mock('../../ai/session/AiSessionContext', () => ({ useOptionalAiSession: () => null }));
vi.mock('../learn/StudySheet', () => {
  throw new Error('Study chunk unavailable');
});
vi.mock('../ui/KeyHints', () => {
  throw new Error('Shortcuts chunk unavailable');
});

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});

function CurrentPage() {
  const [count, setCount] = useState(0);
  const { openStudySheet } = useStudySheet();
  return (
    <>
      <h1>Current page</h1>
      <button onClick={() => setCount(count + 1)}>Count {count}</button>
      <button onClick={() => openStudySheet()}>Study</button>
    </>
  );
}

it.each(['Study options', 'Keyboard shortcuts'])(
  'contains a failed %s download without losing page state',
  async (label) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<CurrentPage />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Count 0' }));
      if (label === 'Study options') fireEvent.click(screen.getByRole('button', { name: 'Study' }));
      else fireEvent.keyDown(window, { key: '?' });

      expect(
        await screen.findByRole('alertdialog', { name: `${label} unavailable` }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Count 1' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Count 1' })).toBeInTheDocument();
    } finally {
      error.mockRestore();
    }
  },
);
