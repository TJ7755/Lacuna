import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LearnMode, LearnSkeleton } from './LearnMode';
import { db } from '../db/schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createPracticeNode,
  linkCardToLesson,
} from '../db/repository';
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
      db.lessonCards.clear(),
      db.practiceNodes.clear(),
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

  it('does not ratchet the next lesson when a manual practice node gates the slot after it', async () => {
    const course = await createCourse('Physics', { unlockMode: 'semi-linear' });
    const lesson1 = await createLesson(course.id, 'Kinematics');
    const lesson2 = await createLesson(course.id, 'Dynamics');
    await createLessonCard(course.id, lesson1.id, 'front_back', 'Q1', 'A1');
    // A manual practice node placed right after lesson1 (orderIndex 0) gates the slot.
    await createPracticeNode(course.id, { type: 'manual', name: 'Checkpoint practice', position: 0 });

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

    await screen.findByText(/Kinematics/);
    await answerYes();

    await waitFor(async () => {
      const updatedCourse = await db.courses.get(course.id);
      expect(updatedCourse?.lastInteractedAt).toBeDefined();
    });
    // Give any (incorrect) ratchet write a chance to land before asserting it didn't.
    await new Promise((r) => setTimeout(r, 50));
    expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeUndefined();
  });

  it('serves a card linked into the studied lesson even when its primary lesson is another one', async () => {
    const course = await createCourse('Maths');
    const lessonA = await createLesson(course.id, 'Algebra');
    const lessonB = await createLesson(course.id, 'Geometry');
    const card = await createLessonCard(course.id, lessonA.id, 'front_back', 'Shared Q', 'Shared A');
    await linkCardToLesson(lessonB.id, card.id);

    render(
      <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/lesson/${lessonB.id}/learn`]}>
          <Routes>
            <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText(/Shared Q/)).toBeInTheDocument();
  });

  it('excludes already-reviewed (non-new) cards from a lesson session', async () => {
    const course = await createCourse('English');
    const lesson = await createLesson(course.id, 'Poetry');
    const reviewedCard = await createLessonCard(course.id, lesson.id, 'front_back', 'Reviewed Q', 'A');
    await db.cards.update(reviewedCard.id, { state: 1 });
    await createLessonCard(course.id, lesson.id, 'front_back', 'New Q', 'A');

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

    expect(await screen.findByText(/New Q/)).toBeInTheDocument();
    expect(screen.queryByText(/Reviewed Q/)).not.toBeInTheDocument();
  });

  it("studies only due cards when the lesson's session filter is 'due'", async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Empires', { sessionFilter: 'due' });
    const dueCard = await createLessonCard(course.id, lesson.id, 'front_back', 'Due Q', 'A');
    await db.cards.update(dueCard.id, { state: 1, due: Date.now() - 1000 });
    const notYetDueCard = await createLessonCard(course.id, lesson.id, 'front_back', 'Not Due Q', 'A');
    await db.cards.update(notYetDueCard.id, { state: 1, due: Date.now() + 1000 * 60 * 60 * 24 });
    await createLessonCard(course.id, lesson.id, 'front_back', 'New Q', 'A');

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

    expect(await screen.findByText(/Due Q/)).toBeInTheDocument();
    expect(screen.queryByText(/Not Due Q/)).not.toBeInTheDocument();
    expect(screen.queryByText(/New Q/)).not.toBeInTheDocument();
  });

  it("studies both new and due cards when the lesson's session filter is 'mixed'", async () => {
    const course = await createCourse('Geography');
    const lesson = await createLesson(course.id, 'Rivers', { sessionFilter: 'mixed' });
    const dueCard = await createLessonCard(course.id, lesson.id, 'front_back', 'Due Q', 'A');
    await db.cards.update(dueCard.id, { state: 1, due: Date.now() - 1000 });
    const notYetDueCard = await createLessonCard(course.id, lesson.id, 'front_back', 'Not Due Q', 'A');
    await db.cards.update(notYetDueCard.id, { state: 1, due: Date.now() + 1000 * 60 * 60 * 24 });
    await createLessonCard(course.id, lesson.id, 'front_back', 'New Q', 'A');

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

    // The session serves the due and new cards but never the not-yet-due one.
    // Drive through the first card and require the other category to follow,
    // proving BOTH the new card and the due card are in the session's set.
    const first = await screen.findByText(/^(Due Q|New Q)$/);
    const other = first.textContent === 'Due Q' ? /^New Q$/ : /^Due Q$/;
    expect(screen.queryByText(/Not Due Q/)).not.toBeInTheDocument();
    await answerYes();
    expect(await screen.findByText(other)).toBeInTheDocument();
    expect(screen.queryByText(/Not Due Q/)).not.toBeInTheDocument();
  });

  it('sweeps every taught-but-unratcheted lesson pair from one course-scoped completion', async () => {
    const course = await createCourse('Chemistry II', { unlockMode: 'semi-linear' });
    const lesson1 = await createLesson(course.id, 'A');
    const lesson2 = await createLesson(course.id, 'B');
    const lesson3 = await createLesson(course.id, 'C');
    const lesson4 = await createLesson(course.id, 'D');
    // Both (1,2) and (3,4) are taught-but-unratcheted pairs. lesson1 and lesson3's
    // cards are marked served with a future due date directly (bypassing a
    // per-lesson LearnMode session, which would ratchet its own pair immediately)
    // so both pairs remain unratcheted until the course-scoped sweep below.
    const farFuture = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const c1 = await createLessonCard(course.id, lesson1.id, 'front_back', 'Q1', 'A1');
    await db.cards.update(c1.id, {
      state: 2,
      stability: 5,
      difficulty: 5,
      lastReviewed: Date.now(),
      due: farFuture,
    });
    const c3 = await createLessonCard(course.id, lesson3.id, 'front_back', 'Q3', 'A3');
    await db.cards.update(c3.id, {
      state: 2,
      stability: 5,
      difficulty: 5,
      lastReviewed: Date.now(),
      due: farFuture,
    });
    // The course-scoped practice session itself needs a due new card to serve.
    await createLessonCard(course.id, lesson2.id, 'front_back', 'Q2', 'A2');

    expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeUndefined();
    expect((await db.lessons.get(lesson4.id))?.unlockedAt).toBeUndefined();

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

    await screen.findByText(/Chemistry II/);
    await answerYes();

    await waitFor(async () => {
      expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeDefined();
      expect((await db.lessons.get(lesson4.id))?.unlockedAt).toBeDefined();
    });
  });

  it('never writes unlockedAt under open or linear unlock modes', async () => {
    for (const unlockMode of ['open', 'linear'] as const) {
      await Promise.all([
        db.courses.clear(),
        db.lessons.clear(),
        db.cards.clear(),
      ]);
      const course = await createCourse(`Mode ${unlockMode}`, { unlockMode });
      const lesson1 = await createLesson(course.id, 'First');
      const lesson2 = await createLesson(course.id, 'Second');
      await createLessonCard(course.id, lesson1.id, 'front_back', 'Q1', 'A1');

      const { unmount } = render(
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

      await screen.findByText(/First/);
      await answerYes();

      await waitFor(async () => {
        const updatedCourse = await db.courses.get(course.id);
        expect(updatedCourse?.lastInteractedAt).toBeDefined();
      });
      await new Promise((r) => setTimeout(r, 50));
      expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeUndefined();
      unmount();
    }
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
