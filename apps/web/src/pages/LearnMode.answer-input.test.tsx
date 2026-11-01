import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { db } from '../db/schema';
import type * as JevModule from '../jev';
import type { JevTypedVerdict } from '../jev';
import { AccentProvider } from '../state/AccentContext';
import { writeAnswerInput } from '../state/answerInput';
import { writeAnswerStrictness } from '../state/answerStrictness';
import type * as MotionSpeedModule from '../state/motionSpeed';
import { ThemeProvider } from '../state/ThemeContext';
import { LearnMode } from './LearnMode';

vi.mock('../state/motionSpeed', async (original) => ({
  ...(await original<typeof MotionSpeedModule>()),
  speedMultiplier: () => 0,
}));
const marker = vi.hoisted(() => vi.fn());
vi.mock('../jev', async (original) => ({
  ...(await original<typeof JevModule>()),
  useJevTypedMarker: () => marker,
}));

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
  marker.mockReset();
});

function changePreference(value: 'type' | 'reveal') {
  act(() => {
    localStorage.setItem('lacuna.answerInput', value);
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'lacuna.answerInput', newValue: value }),
    );
  });
}

async function renderSession() {
  const course = await createCourse('Captured input');
  const lesson = await createLesson(course.id, 'Vocabulary');
  await createLessonCard(course.id, lesson.id, 'front_back', 'Capital of France?', 'Paris');
  await createLessonCard(course.id, lesson.id, 'front_back', 'Capital of England?', 'London');
  return render(
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
}

it.each(['standard', 'exact'] as const)(
  'keeps typed feedback and controls when the preference changes while Jev is pending (%s)',
  async (strictness) => {
    writeAnswerInput('type');
    writeAnswerStrictness(strictness);
    let resolve!: (verdict: JevTypedVerdict) => void;
    marker.mockImplementation(
      () =>
        new Promise<JevTypedVerdict>((done) => {
          resolve = done;
        }),
    );
    const { container } = await renderSession();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), {
      target: { value: 'A different capital' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    await waitFor(() => expect(marker).toHaveBeenCalledOnce());
    changePreference('reveal');

    expect(screen.getByText('Checking your answer.')).toBeInTheDocument();
    expect(
      container.querySelector('[data-study-face="back"] [data-typed-checking]'),
    ).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'No' })).not.toBeInTheDocument();
    await act(async () =>
      resolve({
        outcome: 'correct',
        provenance: { by: 'jev', model: 'jev-test', confidence: 0.99, markedAt: 1 },
        feedback: { kind: 'partial', parts: [] },
      }),
    );

    if (strictness === 'exact') {
      await screen.findByRole('button', { name: 'Yes' });
      expect(
        container.querySelector('[data-study-face="back"] [data-typed-verdict="unsure"]'),
      ).not.toBeNull();
      expect(await db.reviewHistory.count()).toBe(0);
      return;
    }

    await waitFor(async () =>
      expect(await db.reviewHistory.toArray()).toEqual([
        expect.objectContaining({ input: 'typed' }),
      ]),
    );
    await screen.findByText(/^show answer$/i, { selector: 'button' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByRole('button', { name: 'Yes' });
    expect(
      container.querySelector('[data-study-face="back"] [aria-label="Submitted response"]'),
    ).toHaveTextContent('A different capital');
    expect(await db.reviewHistory.count()).toBe(0);
    expect(marker).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: 'ArrowDown', code: 'ArrowDown' });
    await screen.findByText(/^show answer$/i, { selector: 'button' });
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument();
  },
);

it('keeps a revealed answer in reveal mode until it returns to the question', async () => {
  writeAnswerInput('reveal');
  const { container } = await renderSession();
  fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
  changePreference('type');
  expect(container.querySelector('[data-study-face="back"] del')).toBeNull();
  expect(screen.getByRole('button', { name: 'Yes' })).toBeVisible();
  expect(
    screen.queryByRole('textbox', { name: 'Your answer', hidden: true }),
  ).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'ArrowDown', code: 'ArrowDown' });
  await screen.findByRole('textbox', { name: 'Your answer' });
  expect(marker).not.toHaveBeenCalled();
});

it('restores typed answer feedback on Undo after the preference changes to reveal', async () => {
  writeAnswerInput('type');
  marker.mockResolvedValue({
    outcome: 'correct',
    provenance: null,
    feedback: { kind: 'same', parts: [] },
  });
  const { container } = await renderSession();
  fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), {
    target: { value: 'A different capital' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  await waitFor(async () => expect(await db.reviewHistory.count()).toBe(1));
  changePreference('reveal');
  await screen.findByText(/^show answer$/i, { selector: 'button' });
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await screen.findByRole('button', { name: 'Yes' });
  expect(
    container.querySelector('[data-study-face="back"] [aria-label="Submitted response"]'),
  ).toHaveTextContent('A different capital');
  expect(await db.reviewHistory.count()).toBe(0);
});
