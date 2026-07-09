import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LearnMode, LearnSkeleton } from './LearnMode';
import { db } from '../db/schema';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';

describe('LearnSkeleton', () => {
  it('renders the skeleton loading screen', () => {
    render(<LearnSkeleton />);
    // The skeleton uses animate-pulse classes on placeholder divs
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders header and main areas', () => {
    const { container } = render(<LearnSkeleton />);
    const header = container.querySelector('header');
    const main = container.querySelector('main');
    expect(header).toBeInTheDocument();
    expect(main).toBeInTheDocument();
  });
});

/**
 * Reveal and answer "Yes" via the silent-mode buttons (the default grading mode).
 * The FlipCard wrapper itself also carries an aria-label of "Show answer" (for
 * tap-to-flip), so the actual <button> element is picked out explicitly.
 */
async function answerYes() {
  const revealCandidates = await screen.findAllByRole('button', { name: /show answer/i });
  fireEvent.click(revealCandidates.find((el) => el.tagName === 'BUTTON')!);
  fireEvent.click(await screen.findByRole('button', { name: /^yes$/i }));
}

describe('LearnMode course/lesson scope', () => {
  beforeEach(async () => {
    await Promise.all([
      db.courses.clear(),
      db.lessons.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.sessionHistory.clear(),
      db.userPerformance.clear(),
    ]);
    localStorage.clear();
  });

  it('studies a lesson session over its new cards, recorded against the course', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Atomic structure');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Q1', 'A1');

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

    // Header shows the lesson's own name (not the course name).
    expect(await screen.findByText(/Atomic structure/)).toBeInTheDocument();

    await answerYes();

    await waitFor(async () => {
      const updatedCourse = await db.courses.get(course.id);
      expect(updatedCourse?.lastInteractedAt).toBeDefined();
    });
    // Course-keyed review: sessionHistory carries courseId, not just deckId.
    const history = await db.sessionHistory.toArray();
    expect(history.some((h) => h.courseId === course.id)).toBe(true);
  });

  it('ratchets the next lesson unlock under semi-linear mode once the studied lesson is taught', async () => {
    const course = await createCourse('Biology', { unlockMode: 'semi-linear' });
    const lesson1 = await createLesson(course.id, 'Cells');
    const lesson2 = await createLesson(course.id, 'Genetics');
    await createLessonCard(course.id, lesson1.id, 'front_back', 'Q1', 'A1');

    expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeUndefined();

    render(
      <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/lesson/${lesson1.id}/learn`]}>
          <Routes>
            <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
      </ThemeProvider>,
    );

    await screen.findByText(/Cells/);
    await answerYes();

    await waitFor(async () => {
      expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeDefined();
    });
  });

  it('studies a course-wide practice session over all due course cards', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Ancient Rome');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Q1', 'A1');

    render(
      <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/course/${course.id}/learn`]}>
          <Routes>
            <Route path="/course/:courseId/learn" element={<LearnMode />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
      </ThemeProvider>,
    );

    // Header shows the course's own name.
    expect(await screen.findByText(/History/)).toBeInTheDocument();

    await answerYes();

    await waitFor(async () => {
      const updatedCourse = await db.courses.get(course.id);
      expect(updatedCourse?.lastInteractedAt).toBeDefined();
    });
  });
});
