import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { db } from '../db/schema';
import { AccentProvider } from '../state/AccentContext';
import { writeAnswerInput } from '../state/answerInput';
import { ThemeProvider } from '../state/ThemeContext';
import { ToastProvider } from '../components/ui/Toast';
import { LearnMode } from './LearnMode';
import type * as MotionSpeedModule from '../state/motionSpeed';

vi.mock('../state/motionSpeed', async (original) => ({
  ...(await original<typeof MotionSpeedModule>()),
  speedMultiplier: () => 0,
}));

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
});

describe('typed study accessibility', () => {
  it('keeps a visible answer label after typing and submits once on Enter', async () => {
    const course = await createCourse('Vocabulary');
    const lesson = await createLesson(course.id, 'French', { answerMode: 'type' });
    await createLessonCard(course.id, lesson.id, 'front_back', 'Cat', 'chat');
    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );
    // A lesson without notes starts on its first card.
    const input = await screen.findByRole('textbox', { name: 'Your answer' });
    fireEvent.change(input, { target: { value: 'chat' } });
    expect(screen.getByText('Your answer', { selector: 'label' })).toBeVisible();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(await db.reviewHistory.count()).toBe(0);
  });
});

it('clears an unsubmitted answer when switching away from typing', async () => {
  writeAnswerInput('type');
  const course = await createCourse('Abandoned typing');
  const lesson = await createLesson(course.id, 'Vocabulary');
  await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
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
  act(() => writeAnswerInput('reveal'));
  act(() => writeAnswerInput('type'));
  expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('');
});
