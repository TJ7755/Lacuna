import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { createCard, createCourse } from '../db/repository';
import * as reviews from '../db/reviewRepository';
import { db } from '../db/schema';
import { ThemeProvider } from '../state/ThemeContext';
import type * as MotionSpeedModule from '../state/motionSpeed';
import { LearnMode } from './LearnMode';

vi.mock('../state/motionSpeed', async (importOriginal) => ({
  ...(await importOriginal<typeof MotionSpeedModule>()),
  speedMultiplier: () => 0,
}));

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
});

describe('LearnMode pending Undo', () => {
  it.each([false, true])('blocks grades until Undo settles (failure: %s)', async (fails) => {
    const course = await createCourse('Pending Undo');
    await createCard(course.id, 'front_back', 'First question', 'First answer');
    await createCard(course.id, 'front_back', 'Second question', 'Second answer');
    const originalUndo = reviews.undoReview;
    let releaseUndo!: () => void;
    const pending = new Promise<void>((resolve) => {
      releaseUndo = resolve;
    });
    const undo = vi.spyOn(reviews, 'undoReview').mockImplementation(async (snapshot) => {
      await pending;
      if (fails) throw new Error('Undo unavailable');
      return originalUndo(snapshot);
    });
    const record = vi.spyOn(reviews, 'recordReview');

    try {
      render(
        <ThemeProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </ThemeProvider>,
      );
      fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
      await screen.findByRole('button', { name: 'Undo' });
      await waitFor(async () => expect(await db.reviewHistory.count()).toBe(1));
      fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
      const yes = await screen.findByRole('button', { name: 'Yes' });
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(undo).toHaveBeenCalledTimes(1));

      await act(async () => {
        fireEvent.click(yes);
      });
      expect(record).toHaveBeenCalledTimes(1);
      expect(await db.reviewHistory.count()).toBe(1);

      act(() => releaseUndo());
      if (fails) {
        await screen.findByText('Undo unavailable');
      } else {
        await waitFor(async () => expect(await db.reviewHistory.count()).toBe(0));
        fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
      }
      fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
      await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
      await waitFor(async () => expect(await db.reviewHistory.count()).toBe(fails ? 2 : 1));
    } finally {
      act(() => releaseUndo());
      undo.mockRestore();
      record.mockRestore();
    }
  });
});
