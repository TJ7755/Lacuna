import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { db } from '../db/schema';
import type * as JevModule from '../jev';
import type * as MotionSpeedModule from '../state/motionSpeed';
import { LearnMode } from './LearnMode';

vi.mock('../state/motionSpeed', async (importOriginal) => ({
  ...(await importOriginal<typeof MotionSpeedModule>()),
  speedMultiplier: () => 0,
}));
const marker = vi.hoisted(() => vi.fn());
vi.mock('../jev', async (importOriginal) => ({
  ...(await importOriginal<typeof JevModule>()),
  useJevTypedMarker: () => marker,
}));

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
  marker.mockReset();
});

describe('automatic final-answer Undo', () => {
  it.each([false, true])(
    'keeps completion reversible until confirmed (Simple: %s)',
    async (simple) => {
      const course = await createCourse('Automatic final answer', { learnFirst: simple });
      const lesson = await createLesson(course.id, 'Colours');
      const card = await createLessonCard(
        course.id,
        lesson.id,
        'front_back',
        'Name a colour.',
        'Red',
        [],
        undefined,
        'type',
      );
      const onStepFinished = vi.fn();
      render(
        <ThemeProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
              <Routes>
                <Route
                  path="/lesson/:lessonId/learn"
                  element={<LearnMode onStepFinished={onStepFinished} />}
                />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </ThemeProvider>,
      );
      const input = await screen.findByRole('textbox', { name: 'Your answer' });
      fireEvent.change(input, { target: { value: 'Red' } });
      fireEvent.click(screen.getByRole('button', { name: 'Check answer', exact: true }));
      await screen.findByRole('main', { name: 'Session report' });
      expect(onStepFinished).not.toHaveBeenCalled();
      const report = screen.getByRole('main', { name: 'Session report' });
      const undo = [...report.querySelectorAll('button')].find(
        (button) => button.textContent === 'Undo last answer',
      );
      expect(undo).toBeDefined();
      await act(async () => {
        fireEvent.click(undo!);
      });
      await screen.findByRole('textbox', { name: 'Your answer' });
      expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(0);
      expect(onStepFinished).not.toHaveBeenCalled();
      fireEvent.change(screen.getByRole('textbox', { name: 'Your answer' }), {
        target: { value: 'Red' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Check answer', exact: true }));
      await screen.findByRole('main', { name: 'Session report' });
      fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }));
      await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
      expect(marker).not.toHaveBeenCalled();
    },
  );
});
