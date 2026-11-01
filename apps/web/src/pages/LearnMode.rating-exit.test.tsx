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
import * as completion from './learn/sessionCompletionPersistence';
import type { SessionSummary } from '../components/learn/types';

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

async function startSession({
  finalCard = false,
  onStepFinished,
  onFlowExit,
}: {
  finalCard?: boolean;
  onStepFinished?: (summary: SessionSummary) => void;
  onFlowExit?: () => void;
} = {}) {
  const course = await createCourse('Interrupted rating', { unlockMode: 'semi-linear' });
  const lesson = await createLesson(course.id, 'Recall');
  const nextLesson = await createLesson(course.id, 'Next lesson');
  const first = await createLessonCard(
    course.id,
    lesson.id,
    'front_back',
    'First question',
    'First answer',
  );
  const cardIds = [first.id];
  if (!finalCard) {
    const second = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Second question',
      'Second answer',
    );
    cardIds.push(second.id);
  }
  render(
    <ThemeProvider>
      <AccentProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
            <Routes>
              <Route
                path="/lesson/:lessonId/learn"
                element={
                  <LearnMode
                    request={onStepFinished ? { kind: 'lesson', lessonId: lesson.id } : undefined}
                    onStepFinished={onStepFinished}
                    onFlowExit={onFlowExit}
                  />
                }
              />
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
  return { lesson, nextLesson, cardId, cardIds };
}

function rateAndExit() {
  fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
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
  fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
  await screen.findByText('Left session');
  expect(await db.reviewHistory.count()).toBe(1);
});

it('retains the pending save through Stay and another grade before a confirmed exit', async () => {
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
  try {
    rateAndExit();
    const firstDialog = await screen.findByRole('dialog', { name: 'Leave this session?' });
    expect(firstDialog).toHaveTextContent('Saving your answer…');
    expect(firstDialog).not.toHaveTextContent('Your progress is saved');
    fireEvent.click(within(firstDialog).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    rateAndExit();
    const dialog = await screen.findByRole('dialog', { name: 'Leave this session?' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
    });
    expect(dialog).toHaveTextContent('Saving your answer…');
    expect(screen.queryByText('Left session')).not.toBeInTheDocument();
    expect(await db.reviewHistory.count()).toBe(0);
  } finally {
    await act(async () => release());
    await waitFor(async () => expect(await db.reviewHistory.count()).toBe(1));
  }
  await screen.findByText('Left session');
  expect(await db.reviewHistory.count()).toBe(1);
});

it.each(['success', 'failure'] as const)(
  'settles completion produced by the final answer before leaving (%s)',
  async (outcome) => {
    const { nextLesson } = await startSession({ finalCard: true });
    let releaseAnswer!: () => void;
    const answerGate = new Promise<void>((resolve) => {
      releaseAnswer = resolve;
    });
    const saveAnswer = persistence.persistSimpleSessionAnswer;
    vi.spyOn(persistence, 'persistSimpleSessionAnswer').mockImplementationOnce(async (...args) => {
      await answerGate;
      return saveAnswer(...args);
    });
    let releaseCompletion!: () => void;
    const completionGate = new Promise<void>((resolve) => {
      releaseCompletion = resolve;
    });
    let started!: () => void;
    const completionStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const saveCompletion = completion.persistSessionCompletion;
    vi.spyOn(completion, 'persistSessionCompletion').mockImplementationOnce(async (...args) => {
      started();
      await completionGate;
      if (outcome === 'failure') throw new Error('Completion failed');
      return saveCompletion(...args);
    });
    try {
      rateAndExit();
      const dialog = await screen.findByRole('dialog', { name: 'Leave this session?' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
      await act(async () => {
        releaseAnswer();
        await completionStarted;
      });
      expect(await db.reviewHistory.count()).toBe(1);
      expect(screen.queryByText('Left session')).not.toBeInTheDocument();
      expect((await db.lessons.get(nextLesson.id))?.unlockedAt).toBeUndefined();
    } finally {
      await act(async () => {
        releaseAnswer();
        releaseCompletion();
      });
    }
    if (outcome === 'failure') {
      await screen.findByText('Completion failed');
      expect(screen.queryByText('Left session')).not.toBeInTheDocument();
      expect((await db.lessons.get(nextLesson.id))?.unlockedAt).toBeUndefined();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leave' }),
      );
    }
    await screen.findByText('Left session');
    expect((await db.lessons.get(nextLesson.id))?.unlockedAt).toBeDefined();
  },
);

it.each(['Stay', 'Leave', 'cancelled browser unload'] as const)(
  'resolves final-card parent continuation after %s',
  async (decision) => {
    const onStepFinished = vi.fn();
    const onFlowExit = vi.fn();
    const { nextLesson } = await startSession({ finalCard: true, onStepFinished, onFlowExit });
    if (decision === 'cancelled browser unload') {
      fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
      const event = new Event('beforeunload', { cancelable: true });
      act(() => {
        window.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
      await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onFlowExit).not.toHaveBeenCalled();
      expect(await db.reviewHistory.count()).toBe(1);
      return;
    }
    rateAndExit();
    const dialog = await screen.findByRole('dialog', { name: 'Leave this session?' });
    await waitFor(async () =>
      expect((await db.lessons.get(nextLesson.id))?.unlockedAt).toBeDefined(),
    );
    expect(onStepFinished).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: decision }));
    if (decision === 'Stay') {
      await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
      expect(onFlowExit).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(onFlowExit).toHaveBeenCalledOnce());
      expect(onStepFinished).not.toHaveBeenCalled();
    }
    expect(await db.reviewHistory.count()).toBe(1);
  },
);

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
  fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
  await waitFor(async () => expect(await db.reviewHistory.count()).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('1 of 2 Cards answered.');
  expect(await db.reviewHistory.count()).toBe(1);
});
