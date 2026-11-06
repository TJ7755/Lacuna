import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { db } from '../db/schema';
import type * as JevModule from '../jev';
import type * as MotionSpeedModule from '../state/motionSpeed';
import { writeAnswerInput } from '../state/answerInput';
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
  it.each([
    [false, true],
    [true, true],
    [false, false],
    [true, false],
  ])(
    'keeps completion reversible until confirmed (Simple: %s, Undo: %s)',
    async (simple, undoAnswer) => {
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
          <AccentProvider>
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
          </AccentProvider>
        </ThemeProvider>,
      );
      const input = await screen.findByRole('textbox', { name: 'Your answer' });
      fireEvent.change(input, { target: { value: 'Red' } });
      fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
      await screen.findByRole('main', { name: 'Session report' });
      expect(onStepFinished).not.toHaveBeenCalled();
      const report = screen.getByRole('main', { name: 'Session report' });
      if (!undoAnswer) {
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
        return;
      }
      const undo = [...report.querySelectorAll('button')].find(
        (button) => button.textContent === 'Undo last answer',
      );
      expect(undo).toBeDefined();
      await act(async () => {
        fireEvent.click(undo!);
      });
      await screen.findByRole('button', { name: 'Yes' });
      expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(0);
      expect(onStepFinished).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
      await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
      expect(marker).not.toHaveBeenCalled();
    },
  );
});

it('does not automatically grade an abandoned answer after cross-tab preference changes', async () => {
  writeAnswerInput('type');
  const course = await createCourse('Abandoned response');
  const lesson = await createLesson(course.id, 'Vocabulary');
  await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  const changePreference = (value: 'type' | 'reveal') =>
    act(() => {
      localStorage.setItem('lacuna.answerInput', value);
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'lacuna.answerInput', newValue: value }),
      );
    });
  render(
    <ThemeProvider>
      <AccentProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn?mode=simple`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AccentProvider>
    </ThemeProvider>,
  );
  fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), {
    target: { value: 'Answer' },
  });
  changePreference('reveal');
  fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
  changePreference('type');
  for (let step = 0; step < 3; step++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
  }
  expect(await db.reviewHistory.count()).toBe(0);
  expect(screen.getByRole('button', { name: /^yes$/i })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /^yes$/i }));
  await waitFor(async () =>
    expect(await db.reviewHistory.toArray()).toEqual([
      expect.objectContaining({ input: 'reveal' }),
    ]),
  );
});

it('keeps a submitted typed answer eligible after the live preference changes to reveal', async () => {
  writeAnswerInput('type');
  const course = await createCourse('Submitted response');
  const lesson = await createLesson(course.id, 'Vocabulary');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  render(
    <ThemeProvider>
      <AccentProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn?mode=simple`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AccentProvider>
    </ThemeProvider>,
  );
  fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), {
    target: { value: 'Answer' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  act(() => writeAnswerInput('reveal'));
  await waitFor(async () =>
    expect(await db.reviewHistory.where('cardId').equals(card.id).first()).toMatchObject({
      input: 'typed',
      correct: true,
    }),
  );
  expect(marker).not.toHaveBeenCalled();
});
