import 'fake-indexeddb/auto';
import {
  answerYes,
  answerYesAndWaitForExposure,
  continueFromNotes,
  findStudyFaceText,
  queryStudyFaceText,
  storedReviewsForCard,
  resetLearnModeFixtures,
} from './LearnMode.testFixtures';
import { LearnMode } from './LearnMode';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '../db/schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  createPracticeNode,
  linkCardToLesson,
  upsertLessonCardExposure,
} from '../db/repository';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
describe('LearnMode scope', () => {
  beforeEach(resetLearnModeFixtures);

  it('honours explicit Simple Learn for a lesson with Learn first disabled', async () => {
    const course = await createCourse('Optional passes');
    await db.courses.update(course.id, { learnFirst: false });
    const lesson = await createLesson(course.id, 'Any time');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Optional question', 'Answer');
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
    expect(await findStudyFaceText('Optional question')).toBeInTheDocument();
    // The header names the lesson; Simple Learn's own Yes/No grading shows the mode.
    expect(screen.getByRole('heading', { name: 'Any time' })).toBeInTheDocument();
    fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
    expect(await screen.findByRole('button', { name: /^yes$/i })).toBeInTheDocument();
  });

  it.each(['recurring'] as const)(
    'finishes %s due review after a slow Yes instead of repeating tomorrow’s card',
    async (mode) => {
      const course = await createCourse('Biology');
      const lesson = await createLesson(course.id, 'Cells');
      const due = await createLessonCard(
        course.id,
        lesson.id,
        'front_back',
        'Pathogen?',
        'Causes disease',
      );
      const future = await createLessonCard(course.id, lesson.id, 'front_back', 'Future?', 'Later');
      const unseen = await createLessonCard(course.id, lesson.id, 'front_back', 'Unseen?', 'New');
      const now = Date.now();
      for (const card of [due, future, unseen]) await upsertLessonCardExposure(lesson.id, card.id);
      for (const card of [due, future]) {
        await db.cards.update(card.id, {
          state: 2,
          stability: 0.1,
          difficulty: 5,
          reps: 5,
          lastReviewed: now - 10_000,
          due: card.id === due.id ? now - 1 : now + 86_400_000,
        });
      }
      const finished = vi.fn();
      const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
      try {
        render(
          <MemoryRouter>
            <ToastProvider>
              <LearnMode
                request={{ kind: 'practice', courseId: course.id, mode }}
                onStepFinished={finished}
              />
            </ToastProvider>
          </MemoryRouter>,
        );
        await findStudyFaceText('Pathogen?');
        clock.mockReturnValue(10_000);
        await answerYes();
        await waitFor(() => expect(finished).toHaveBeenCalledOnce());
        expect(finished.mock.calls[0][0]).toMatchObject({ reachedGoal: true });
        const reviews = await storedReviewsForCard(due.id);
        expect(reviews).toHaveLength(1);
        expect(reviews[0]).toMatchObject({ grade: 2, correct: true });
        expect((await db.cards.get(due.id))!.due).toBeGreaterThan(Date.now());
        expect(await storedReviewsForCard(future.id)).toHaveLength(0);
        expect(await storedReviewsForCard(unseen.id)).toHaveLength(0);
      } finally {
        clock.mockRestore();
      }
    },
  );

  it('teaches a lesson in Simple mode and records its lesson-scoped FSRS review', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Atomic structure');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q1', 'A1');

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

    // Header shows the lesson's own name (not the course name).
    expect(await screen.findByRole('heading', { name: 'Atomic structure' })).toBeInTheDocument();
    await continueFromNotes();
    const flipCard = (await screen.findAllByRole('button', { name: /show answer/i })).find(
      (element) => element.tagName === 'DIV',
    )!;
    expect(flipCard).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(flipCard, { key: 'Enter' });
    expect(await screen.findByRole('button', { name: /^yes$/i })).toBeInTheDocument();
    const yes = screen.getByRole('button', { name: /^yes$/i });
    await act(async () => {
      fireEvent.click(yes);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (
          (await db.lessonCardExposures.where('lessonId').equals(lesson.id).count()) === 1 &&
          (await db.reviewHistory.where('cardId').equals(card.id).count()) === 1
        )
          return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });
    expect(await db.lessonCardExposures.where('lessonId').equals(lesson.id).count()).toBe(1);
    const reviews = await storedReviewsForCard(card.id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      cardId: card.id,
      courseId: course.id,
      primaryLessonId: lesson.id,
      sessionKind: 'lesson',
      correct: true,
    });
    await waitFor(async () => expect(await db.sessionHistory.count()).toBe(1));
    expect(await db.cards.get(card.id)).toMatchObject({ reps: 1 });
    expect((await db.cards.get(card.id))?.state).not.toBe(0);
  });

  it('ratchets the next lesson unlock under semi-linear mode once the studied lesson is taught', async () => {
    const course = await createCourse('Biology', { unlockMode: 'semi-linear' });
    const lesson1 = await createLesson(course.id, 'Cells');
    const lesson2 = await createLesson(course.id, 'Genetics');
    await createLessonCard(course.id, lesson1.id, 'front_back', 'Q1', 'A1');

    expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeUndefined();

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[`/lesson/${lesson1.id}/learn`]}>
              <Routes>
                <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    await screen.findByRole('heading', { name: 'Cells' });
    await continueFromNotes();
    await answerYes();

    await waitFor(async () => {
      expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeDefined();
    });
  });

  it('does not ratchet the next lesson when an active manual practice node gates the slot after it', async () => {
    const course = await createCourse('Physics', {
      unlockMode: 'semi-linear',
      practiceThresholdMinutesFar: 0,
      practiceThresholdMinutesNear: 0,
    });
    const lesson1 = await createLesson(course.id, 'Kinematics');
    const lesson2 = await createLesson(course.id, 'Dynamics');
    await createLessonCard(course.id, lesson1.id, 'front_back', 'Q1', 'A1');
    // A manual practice node placed right after lesson1 (orderIndex 0) gates the slot.
    await createPracticeNode(course.id, {
      type: 'manual',
      name: 'Checkpoint practice',
      position: 0,
    });

    const { unmount } = render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[`/lesson/${lesson1.id}/learn`]}>
              <Routes>
                <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    await screen.findByRole('heading', { name: 'Kinematics' });
    await continueFromNotes();
    await answerYesAndWaitForExposure(lesson1.id);
    await screen.findByRole('heading', {
      name: /Nice work|Goal reached|Time.s up|hit your daily limit/i,
    });
    await act(async () => unmount());
    // Give any (incorrect) ratchet write a chance to land before asserting it didn't.
    await new Promise((r) => setTimeout(r, 50));
    expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeUndefined();
  });

  it('serves a card linked into the studied lesson even when its primary lesson is another one', async () => {
    const course = await createCourse('Maths');
    const lessonA = await createLesson(course.id, 'Algebra');
    const lessonB = await createLesson(course.id, 'Geometry');
    const card = await createLessonCard(
      course.id,
      lessonA.id,
      'front_back',
      'Shared Q',
      'Shared A',
    );
    await linkCardToLesson(lessonB.id, card.id);

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[`/lesson/${lessonB.id}/learn`]}>
              <Routes>
                <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    const notesUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(notesUnload);
    expect(notesUnload.defaultPrevented).toBe(false);
    await continueFromNotes();
    expect(await findStudyFaceText(/Shared Q/)).toBeInTheDocument();
  });

  it('excludes already-reviewed (non-new) cards from a lesson session', async () => {
    const course = await createCourse('English');
    const lesson = await createLesson(course.id, 'Poetry');
    const reviewedCard = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Reviewed Q',
      'A',
    );
    await db.cards.update(reviewedCard.id, { state: 1 });
    await upsertLessonCardExposure(lesson.id, reviewedCard.id);
    await createLessonCard(course.id, lesson.id, 'front_back', 'New Q', 'A');

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
    expect(await findStudyFaceText(/New Q/)).toBeInTheDocument();
    expect(queryStudyFaceText(/Reviewed Q/)).toBeUndefined();
  });

  it('ignores the legacy due filter because lessons teach every unexposed member', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Empires', { sessionFilter: 'due' });
    const dueCard = await createLessonCard(course.id, lesson.id, 'front_back', 'Due Q', 'A');
    await db.cards.update(dueCard.id, { state: 1, due: Date.now() - 1000 });
    const notYetDueCard = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Not Due Q',
      'A',
    );
    await db.cards.update(notYetDueCard.id, { state: 1, due: Date.now() + 1000 * 60 * 60 * 24 });
    await createLessonCard(course.id, lesson.id, 'front_back', 'New Q', 'A');

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
    const seen = new Set<string>();
    for (let index = 0; index < 3; index++) {
      const card = await findStudyFaceText(/^(Due Q|Not Due Q|New Q)$/);
      seen.add(card.textContent ?? '');
      if (index < 2) await answerYes();
    }
    expect(seen).toEqual(new Set(['Due Q', 'Not Due Q', 'New Q']));
  });

  it('ignores the legacy mixed filter and still teaches future-scheduled unexposed cards', async () => {
    const course = await createCourse('Geography');
    const lesson = await createLesson(course.id, 'Rivers', { sessionFilter: 'mixed' });
    const dueCard = await createLessonCard(course.id, lesson.id, 'front_back', 'Due Q', 'A');
    await db.cards.update(dueCard.id, { state: 1, due: Date.now() - 1000 });
    const notYetDueCard = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Not Due Q',
      'A',
    );
    await db.cards.update(notYetDueCard.id, { state: 1, due: Date.now() + 1000 * 60 * 60 * 24 });
    await createLessonCard(course.id, lesson.id, 'front_back', 'New Q', 'A');

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
    const seen = new Set<string>();
    for (let index = 0; index < 3; index++) {
      const card = await findStudyFaceText(/^(Due Q|Not Due Q|New Q)$/);
      seen.add(card.textContent ?? '');
      if (index < 2) await answerYes();
    }
    expect(seen).toEqual(new Set(['Due Q', 'Not Due Q', 'New Q']));
  });

  it('sweeps every taught-but-unratcheted lesson pair from one course-scoped completion', async () => {
    const course = await createCourse('Chemistry II', { unlockMode: 'semi-linear' });
    const lesson1 = await createLesson(course.id, 'A');
    const lesson2 = await createLesson(course.id, 'B');
    const lesson3 = await createLesson(course.id, 'C');
    const lesson4 = await createLesson(course.id, 'D');
    // Both (1,2) and (3,4) are taught-but-unratcheted pairs. Their exposure rows
    // are inserted directly, bypassing lesson completion so both ratchets remain
    // pending until the course-scoped Practice completion below.
    const c1 = await createLessonCard(course.id, lesson1.id, 'front_back', 'Q1', 'A1');
    await upsertLessonCardExposure(lesson1.id, c1.id);
    const c3 = await createLessonCard(course.id, lesson3.id, 'front_back', 'Q3', 'A3');
    await upsertLessonCardExposure(lesson3.id, c3.id);
    // The course-scoped practice session itself needs a due new card to serve.
    await createLessonCard(course.id, lesson2.id, 'front_back', 'Q2', 'A2');

    expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeUndefined();
    expect((await db.lessons.get(lesson4.id))?.unlockedAt).toBeUndefined();

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[`/course/${course.id}/learn`]}>
              <Routes>
                <Route path="/course/:courseId/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

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
        db.lessonCardExposures.clear(),
      ]);
      const course = await createCourse(`Mode ${unlockMode}`, { unlockMode });
      const lesson1 = await createLesson(course.id, 'First');
      const lesson2 = await createLesson(course.id, 'Second');
      await createLessonCard(course.id, lesson1.id, 'front_back', 'Q1', 'A1');

      const { unmount } = render(
        <ThemeProvider>
          <AccentProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={[`/lesson/${lesson1.id}/learn`]}>
                <Routes>
                  <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
                </Routes>
              </MemoryRouter>
            </ToastProvider>
          </AccentProvider>
        </ThemeProvider>,
      );

      await screen.findByRole('heading', { name: 'First' });
      await continueFromNotes();
      await answerYesAndWaitForExposure(lesson1.id);
      await screen.findByRole('heading', {
        name: /Nice work|Goal reached|Time.s up|hit your daily limit/i,
      });
      await act(async () => unmount());
      await new Promise((r) => setTimeout(r, 50));
      expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeUndefined();
    }
  });

  it('studies a course-wide practice session over all due course cards', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Ancient Rome');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q1', 'A1');
    await upsertLessonCardExposure(lesson.id, card.id);

    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[`/course/${course.id}/learn`]}>
              <Routes>
                <Route path="/course/:courseId/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
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
