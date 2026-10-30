import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { db } from '../db/schema';
import { LearnMode } from './LearnMode';
import * as persistence from './learn/sessionAnswerPersistence';
import { loadSimpleSession } from './learn/simpleSessionPersistence';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
  const nativeAnimate = Element.prototype.animate;
  vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element, ...args) {
    const animation = nativeAnimate.apply(this, args);
    void animation.finished.catch(() => {});
    return animation;
  });
});
afterEach(() => vi.restoreAllMocks());

async function startSession() {
  const course = await createCourse('Interrupted rating');
  const lesson = await createLesson(course.id, 'Recall');
  const first = await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    'First question',
    'First answer',
  );
  const second = await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    'Second question',
    'Second answer',
  );
  render(
    <ThemeProvider>
      <AccentProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
              <Route path="/course/:courseId/lesson/:lessonId" element={<p>Left session</p>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AccentProvider>
    </ThemeProvider>,
  );
  fireEvent.click(await screen.findByText('Show answer', { selector: 'button' }));
  const cardId = document
    .querySelector('[data-study-card-id]')!
    .getAttribute('data-study-card-id')!;
  return { lesson, cardId, cardIds: [first.id, second.id] };
}

function rateAndExit() {
  fireEvent.click(screen.getByRole('button', { name: 'Yes', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Exit', exact: true }));
}

it('saves an accepted rating when Exit interrupts its departure', async () => {
  const { lesson, cardId, cardIds } = await startSession();
  rateAndExit();
  const dialog = await screen.findByRole('dialog', { name: 'Leave this session?' });
  await waitFor(() => expect(dialog).toHaveTextContent('1 of 2 Cards answered.'));
  expect(await db.reviewHistory.where('cardId').equals(cardId).count()).toBe(1);
  expect(await db.lessonCardExposures.get([lesson.id, cardId])).toBeDefined();
  expect(loadSimpleSession({ kind: 'lesson', lessonId: lesson.id }, cardIds)?.outcomes).toEqual(
    new Map([[cardId, 'correct']]),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Leave', exact: true }));
  await screen.findByText('Left session');
  expect(await db.reviewHistory.count()).toBe(1);
});

it('keeps a confirmed exit in the session until the accepted answer is stored', async () => {
  await startSession();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const save = persistence.persistSimpleSessionAnswer;
  vi.spyOn(persistence, 'persistSimpleSessionAnswer').mockImplementationOnce(async (...args) => {
    await gate;
    return save(...args);
  });
  rateAndExit();
  const dialog = await screen.findByRole('dialog', { name: 'Leave this session?' });
  expect(dialog).toHaveTextContent('Saving your answer…');
  expect(dialog).not.toHaveTextContent('Your progress is saved');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Leave', exact: true }));
  await screen.findByRole('button', { name: 'Leaving…' });
  expect(screen.queryByText('Left session')).not.toBeInTheDocument();
  expect(await db.reviewHistory.count()).toBe(0);
  await act(async () => {
    release();
  });
  await screen.findByText('Left session');
  expect(await db.reviewHistory.count()).toBe(1);
});

it('makes an unsuccessful save explicit and lets Stay retry the same answer', async () => {
  await startSession();
  vi.spyOn(persistence, 'persistSimpleSessionAnswer').mockRejectedValueOnce(
    new Error('Storage unavailable'),
  );
  rateAndExit();
  const dialog = await screen.findByRole('dialog', { name: 'Leave this session?' });
  await waitFor(() => expect(dialog).toHaveTextContent('Your last answer was not saved.'));
  expect(dialog).not.toHaveTextContent('Your progress is saved');
  expect(await db.reviewHistory.count()).toBe(0);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Stay', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(await screen.findByRole('button', { name: 'Yes', exact: true }));
  await waitFor(async () => expect(await db.reviewHistory.count()).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: 'Exit', exact: true }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('1 of 2 Cards answered.');
  expect(await db.reviewHistory.count()).toBe(1);
});
