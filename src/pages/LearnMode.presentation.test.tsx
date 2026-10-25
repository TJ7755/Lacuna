import 'fake-indexeddb/auto';
import {
  answerYes,
  answerNo,
  continueFromNotes,
  studyFaceText,
  findStudyFaceText,
  resetLearnModeFixtures,
} from './LearnMode.testFixtures';
import { LearnMode } from './LearnMode';
import { describe, expect, it, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '../db/schema';
import { createCard, createCourse, createLesson, createLessonCard } from '../db/repository';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
import { writeStartInFocusMode } from '../state/focusModePreference';
describe('LearnMode presentation', () => {
  beforeEach(resetLearnModeFixtures);

  it('does not paint a focus ring on the programmatic study container', async () => {
    const course = await createCourse('Focus ring');
    const lesson = await createLesson(course.id, 'Focus lesson');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Focus question', 'Answer');
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
    expect(await findStudyFaceText('Focus question')).toBeInTheDocument();
    // The study container is focused programmatically as a return point after
    // overlays close, so it must suppress the global :focus-visible indicator.
    // Otherwise an orange frame appears around the whole study column.
    expect(screen.getByRole('main', { name: 'Study card' })).toHaveClass(
      'focus-visible:shadow-none',
    );
  });

  it('starts in Focus Mode from the persisted preference and Esc leaves it for this session', async () => {
    localStorage.setItem('lacuna.startInFocusMode', 'on');
    const course = await createCourse('Physics');
    const lesson = await createLesson(course.id, 'Forces');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');

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
    expect(await screen.findByRole('button', { name: 'Show study controls' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave focus mode' })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    // Entering focus mode now lives in the card-actions menu, so leaving it is observed
    // by the study chrome becoming permanently visible rather than by a header toggle.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Show study controls' })).not.toBeInTheDocument();
    });
    expect(localStorage.getItem('lacuna.startInFocusMode')).toBe('on');
  });

  it('keeps practice-session chrome and grading controls mounted while Yes and No replace the card surface', async () => {
    const now = Date.now();
    const deck = await createCourse('Continuous practice');
    await db.schedulingUnits.update(deck.id, { examDate: now + 7 * 24 * 60 * 60 * 1000 });
    for (const question of ['First question', 'Second question', 'Third question']) {
      const card = await createCard(deck.id, 'front_back', question, 'Answer');
      await db.cards.update(card.id, {
        stability: 2,
        difficulty: 5,
        lastReviewed: now - 24 * 60 * 60 * 1000,
        reps: 1,
        state: 2,
        due: now - 1,
      });
    }

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

    const progress = await screen.findByRole('progressbar', { name: 'Session progress' });
    const header = progress.closest('header');
    const firstSurface = document.querySelector<HTMLElement>('[data-study-card-id]');
    expect(header).not.toBeNull();
    expect(firstSurface).not.toBeNull();
    // The grades flow back into the next card's reveal, so the controls must persist.
    const reveal = () => screen.getByText(/^show answer$/i, { selector: 'button' });
    const firstReveal = reveal();

    await answerNo();
    await waitFor(() => {
      const next = document.querySelector<HTMLElement>('[data-study-card-id]');
      expect(next?.dataset.studyCardId).not.toBe(firstSurface?.dataset.studyCardId);
      expect(screen.getByRole('progressbar', { name: 'Session progress' })).toBe(progress);
      expect(progress.closest('header')).toBe(header);
      expect(reveal()).toBe(firstReveal);
    });

    const secondSurface = document.querySelector<HTMLElement>('[data-study-card-id]');
    await answerYes();
    await waitFor(() => {
      const next = document.querySelector<HTMLElement>('[data-study-card-id]');
      expect(next?.dataset.studyCardId).not.toBe(secondSurface?.dataset.studyCardId);
      expect(screen.getByRole('progressbar', { name: 'Session progress' })).toBe(progress);
      expect(progress.closest('header')).toBe(header);
    });
    await waitFor(async () => expect(await db.sessionHistory.count()).toBe(1));
  });

  it('reveals an operable Focus Mode exit control on touch-sized screens', async () => {
    localStorage.setItem('lacuna.startInFocusMode', 'on');
    localStorage.setItem('lacuna.inputMode', 'touch');
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const course = await createCourse('Mobile focus');
    const lesson = await createLesson(course.id, 'Touch lesson');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Touch question', 'Answer');

    try {
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
      fireEvent.click(await screen.findByRole('button', { name: 'Show study controls' }));
      const exitFocus = await screen.findByRole('button', { name: 'Leave focus mode' });
      expect(exitFocus).not.toHaveClass('hidden');

      fireEvent.click(exitFocus);
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: 'Show study controls' }),
        ).not.toBeInTheDocument();
      });
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it('portals touch card actions outside the sticky study header', async () => {
    localStorage.setItem('lacuna.inputMode', 'touch');
    const deck = await createCourse('Touch actions');
    await createCard(deck.id, 'front_back', 'Touch question', 'Touch answer');

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

    expect(await findStudyFaceText('Touch question')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Card actions' }));
    const dialog = await screen.findByRole('dialog', { name: 'Card actions' });
    expect(dialog.parentElement).toBe(document.body);
  });

  it('anchors touch grading controls to the bottom of the viewport', async () => {
    // The thumb rests at the bottom of a phone, so grading must live there rather than
    // in the middle of the screen. Nothing else asserted this, and the redesign plan
    // wrongly recorded the controls as mid-screen after measuring a resized desktop
    // browser, which reports no touch points and so renders the pointer layout.
    localStorage.setItem('lacuna.inputMode', 'touch');
    const deck = await createCourse('Thumb zone');
    await createCard(deck.id, 'front_back', 'Thumb question', 'Thumb answer');

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

    expect(await findStudyFaceText('Thumb question')).toBeInTheDocument();
    // The card surface is itself a button labelled "Show answer"; the grading control is
    // the real <button> element.
    const candidates = await screen.findAllByRole('button', { name: /show answer/i });
    const reveal = candidates.find((element) => element.tagName === 'BUTTON')!;
    const sheet = reveal.closest('.fixed');
    expect(sheet).not.toBeNull();
    expect(sheet).toHaveClass('bottom-0');
  });

  it('does not reset an active session when the default Focus Mode preference changes', async () => {
    const course = await createCourse('Focus preferences');
    const lesson = await createLesson(course.id, 'Stable session');
    await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Keep this question',
      'Visible answer',
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

    await continueFromNotes();
    const revealCandidates = await screen.findAllByRole('button', { name: /show answer/i });
    fireEvent.click(revealCandidates.find((element) => element.tagName === 'BUTTON')!);
    expect(await findStudyFaceText('Visible answer')).toBeInTheDocument();

    await act(async () => {
      writeStartInFocusMode(true);
      // Allow the preference event and any accidentally-triggered async reload to settle.
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await waitFor(() => {
      expect(studyFaceText('Visible answer')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^yes$/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument();
  });
});
