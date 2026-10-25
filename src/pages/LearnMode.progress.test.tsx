import 'fake-indexeddb/auto';
import {
  answerYes,
  answerNo,
  continueFromNotes,
  findStudyFaceText,
  queryStudyFaceText,
  resetLearnModeFixtures,
} from './LearnMode.testFixtures';
import { LearnMode } from './LearnMode';
import { describe, expect, it, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '../db/schema';
import { createCard, createCourse, createLesson, createLessonCard } from '../db/repository';
import { makeSessionContext, sessionProgress } from '../fsrs/session';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
describe('LearnMode progress', () => {
  beforeEach(resetLearnModeFixtures);

  it('tracks current, wrong and correct cards as in-session progress', async () => {
    const course = await createCourse('Computing');
    const lesson = await createLesson(course.id, 'Rendering');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Question one', 'Answer one');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Question two', 'Answer two');

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

    await continueFromNotes();
    expect(await screen.findByRole('progressbar', { name: 'Session progress' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(document.querySelectorAll('[data-session-card-status="current"]')).toHaveLength(1);
    const progressAnnouncement = document.querySelector('header [aria-live="polite"]');
    expect(progressAnnouncement).toHaveTextContent('Card 1 of 2');
    expect(progressAnnouncement).not.toHaveTextContent(/correct|wrong|current|unseen/i);

    await answerNo();
    await waitFor(() => {
      expect(document.querySelectorAll('[data-session-card-status="wrong"]')).toHaveLength(1);
      expect(document.querySelectorAll('[data-session-card-status="current"]')).toHaveLength(1);
      expect(progressAnnouncement).toHaveTextContent('Card 2 of 2');
    });

    await answerYes();
    await waitFor(() => {
      expect(screen.getByRole('progressbar', { name: 'Session progress' })).toHaveAttribute(
        'aria-valuenow',
        '50',
      );
      expect(document.querySelectorAll('[data-session-card-status="correct"]')).toHaveLength(1);
    });
  });

  it('separates session completion from predicted recall in a global objective session', async () => {
    const now = Date.now();
    const deck = await createCourse('Objective deck');
    await db.schedulingUnits.update(deck.id, { examDate: now + 7 * 24 * 60 * 60 * 1000 });
    const configuredDeck = (await db.schedulingUnits.get(deck.id))!;
    const card = await createCard(deck.id, 'front_back', 'Objective question', 'Answer');
    await db.cards.update(card.id, {
      stability: 2,
      difficulty: 5,
      lastReviewed: now - 24 * 60 * 60 * 1000,
      reps: 1,
      state: 2,
      due: now - 1,
    });
    const configuredCard = (await db.cards.get(card.id))!;
    const expected = Math.round(
      sessionProgress([configuredCard], makeSessionContext([configuredDeck]), now) * 100,
    );
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(100);

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByRole('progressbar', { name: 'Session progress' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    // The recall forecast lives in the card actions menu.
    fireEvent.click(screen.getByRole('button', { name: 'Card actions' }));
    expect(screen.getByText(`${expected}% predicted readiness`)).toBeInTheDocument();
    expect(screen.queryByLabelText('Card progress')).not.toBeInTheDocument();
  });

  it('offers Undo after an ordinary button answer and reverses that review', async () => {
    const deck = await createCourse('Undo controls');
    await createCard(deck.id, 'front_back', 'First undo question', 'Answer');
    await createCard(deck.id, 'front_back', 'Second undo question', 'Answer');

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    const firstQuestion = (await findStudyFaceText(/undo question/i)).textContent;
    await answerYes();
    expect(await screen.findByText(/^(Easy|Good|Hard) · \d+% recall at exam$/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(async () => expect(await db.reviewHistory.count()).toBe(0));
    expect(await findStudyFaceText(firstQuestion ?? '')).toBeInTheDocument();
  });

  it('does not offer Undo after the answer has finished the session', async () => {
    const deck = await createCourse('Terminal answer');
    await createCard(deck.id, 'front_back', 'Only question', 'Answer');

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    await findStudyFaceText('Only question');
    await answerYes();

    expect(
      await screen.findByRole('heading', {
        name: /Nice work|Goal reached|Time.s up|hit your daily limit/i,
      }),
    ).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(await db.reviewHistory.count()).toBe(1);
  });

  it('does not create rigid progress slots from unavailable cards outside Simple mode', async () => {
    const now = Date.now();
    const deck = await createCourse('Eligibility deck');
    await db.schedulingUnits.update(deck.id, { examDate: now + 7 * 24 * 60 * 60 * 1000 });
    const available = await createCard(deck.id, 'front_back', 'Available question', 'Answer');
    const suspended = await createCard(deck.id, 'front_back', 'Suspended question', 'Answer');
    await db.cards.update(available.id, {
      stability: 2,
      difficulty: 5,
      lastReviewed: now - 24 * 60 * 60 * 1000,
      reps: 1,
      state: 2,
      due: now - 1,
    });
    await db.cards.update(suspended.id, { suspended: true });

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    expect(await findStudyFaceText('Available question')).toBeInTheDocument();
    expect(queryStudyFaceText('Suspended question')).toBeUndefined();
    expect(screen.queryByLabelText('Card progress')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-session-card-status]')).toHaveLength(0);
  });

  it('uses the filtered card pool for scheduler-driven sessions', async () => {
    const now = Date.now();
    const deck = await createCourse('Filtered deck');
    await db.schedulingUnits.update(deck.id, { examDate: now + 7 * 24 * 60 * 60 * 1000 });
    const flagged = await createCard(deck.id, 'front_back', 'Flagged question', 'Answer');
    const unflagged = await createCard(deck.id, 'front_back', 'Unflagged question', 'Answer');
    const reviewState = {
      stability: 2,
      difficulty: 5,
      lastReviewed: now - 24 * 60 * 60 * 1000,
      reps: 1,
      state: 2 as const,
      due: now - 1,
    };
    await db.cards.update(flagged.id, { ...reviewState, flagged: true });
    await db.cards.update(unflagged.id, reviewState);

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn?filter=flagged']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    expect(await findStudyFaceText('Flagged question')).toBeInTheDocument();
    expect(queryStudyFaceText('Unflagged question')).toBeUndefined();
    expect(screen.queryByLabelText('Card progress')).not.toBeInTheDocument();
  });

  it('does not report a suspended-only filtered pool as completed', async () => {
    const deck = await createCourse('Suspended deck');
    const suspended = await createCard(deck.id, 'front_back', 'Suspended question', 'Answer');
    await db.cards.update(suspended.id, { suspended: true });

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn?filter=suspended']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    expect(
      await screen.findByText('No eligible cards matching suspended cards to study'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', {
        name: 'No eligible cards matching suspended cards to study',
      }),
    ).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText('Suspended question')).not.toBeInTheDocument();
  });

  it.each(['Bury until tomorrow', 'Suspend card'])(
    'does not reach the goal or unlock the next lesson when the final card is removed with %s',
    async (actionLabel) => {
      const course = await createCourse('Removal course', { unlockMode: 'semi-linear' });
      const lesson = await createLesson(course.id, 'Current lesson');
      const nextLesson = await createLesson(course.id, 'Locked lesson');
      await createLessonCard(course.id, lesson.id, 'front_back', 'Only question', 'Answer');

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

      await continueFromNotes();
      fireEvent.click(await screen.findByRole('button', { name: 'Card actions' }));
      fireEvent.click(await screen.findByRole('button', { name: actionLabel }));

      expect(await screen.findByRole('heading', { name: 'Nice work' })).toBeInTheDocument();
      expect(screen.queryByText('Goal reached.')).not.toBeInTheDocument();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect((await db.lessons.get(nextLesson.id))?.unlockedAt).toBeUndefined();
    },
  );

  it('reports 100% loop progress after every Simple card is learned', async () => {
    const course = await createCourse('Complete course');
    const lesson = await createLesson(course.id, 'Complete lesson');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Final question', 'Final answer');

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

    await continueFromNotes();
    await answerYes();

    expect(await screen.findByText('Goal reached.')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('progressbar', { name: 'Cards correct in this pass' }),
      ).toHaveAttribute('aria-valuenow', '100');
    });
  });
});
