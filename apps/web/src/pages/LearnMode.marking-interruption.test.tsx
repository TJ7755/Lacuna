import 'fake-indexeddb/auto';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { db } from '../db/schema';
import type { Card } from '@lacuna/core/db/types';
import type * as JevModule from '../jev';
import type { JevTypedVerdict } from '../jev';
import type * as MotionSpeedModule from '../state/motionSpeed';
import { LearnMode } from './LearnMode';
import { useTypedAutoMark } from './learn/useTypedAutoMark';

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

it('holds a verdict behind the leave dialogue until the learner chooses Stay', async () => {
  const course = await createCourse('Interrupted marking');
  const lesson = await createLesson(course.id, 'Recall');
  await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    'Capital of France?',
    'Paris',
    [],
    undefined,
    'type',
  );
  let resolve!: (verdict: JevTypedVerdict) => void;
  marker.mockImplementation(
    () =>
      new Promise<JevTypedVerdict>((done) => {
        resolve = done;
      }),
  );
  render(
    <ThemeProvider>
      <AccentProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AccentProvider>
    </ThemeProvider>,
  );
  fireEvent.change(await screen.findByRole('textbox', { name: 'Your answer' }), {
    target: { value: 'Lyon' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  await waitFor(() => expect(marker).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
  await screen.findByRole('dialog', { name: 'Leave this session?' });
  await act(async () => {
    resolve({
      outcome: 'incorrect',
      provenance: { by: 'jev', model: 'jev-test', confidence: 0.99, markedAt: 1 },
      feedback: { kind: 'wrong', parts: [] },
    });
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 400));
  });
  expect(await db.reviewHistory.count()).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
  await waitFor(async () => expect(await db.reviewHistory.count()).toBe(1));
});

it('invalidates a held verdict when the expected answer is edited', async () => {
  const card = { id: 'edited', type: 'front_back', front: 'Capital?', back: 'Paris' } as Card;
  marker.mockResolvedValue({ outcome: 'unsure', feedback: null });
  const onMarked = vi.fn();
  const { result, rerender } = renderHook(
    ({ card, paused }) =>
      useTypedAutoMark({
        card,
        paused,
        phase: 'answer',
        isTypingCard: true,
        typedAnswer: 'Paris',
        answerStrictness: 'standard',
        m: 0,
        onMarked,
      }),
    { initialProps: { card, paused: true } },
  );
  await waitFor(() => expect(result.current.state).toBe('marked'));
  rerender({ card: { ...card, back: 'London' }, paused: false });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 400));
  });
  expect(onMarked).not.toHaveBeenCalled();
  expect(marker).toHaveBeenCalledWith(expect.objectContaining({ expected: 'London' }));
  expect(result.current.state).toBe('idle');
});
