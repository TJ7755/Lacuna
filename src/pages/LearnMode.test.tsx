import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom';
import { LearnMode, LearnSkeleton } from './LearnMode';
import { db } from '../db/schema';
import {
  cardsForSequence,
  createCard,
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  createPracticeNode,
  createSequence,
  linkCardToLesson,
  upsertLessonCardExposure,
} from '../db/repository';
import { createOrResumeRevisionPlan } from '../db/revisionPlanRepository';
import * as linesModeCards from '../db/linesModeCards';
import { makeSessionContext, sessionProgress } from '../fsrs/session';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { writeStartInFocusMode } from '../state/focusModePreference';
import { loadSimpleSession } from './learn/simpleSessionPersistence';

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
  fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
  fireEvent.click(await screen.findByRole('button', { name: /^yes$/i }));
}

async function answerNo() {
  fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
  fireEvent.click(await screen.findByRole('button', { name: /^no$/i }));
}

async function answerYesAndWaitForExposure(lessonId: string) {
  fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
  const yes = await screen.findByRole('button', { name: /^yes$/i });
  await act(async () => {
    fireEvent.click(yes);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await db.lessonCardExposures.where('lessonId').equals(lessonId).count()) === 1) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
}

async function continueFromNotes() {
  fireEvent.click(await screen.findByRole('button', { name: /^continue$/i }));
}

async function storedReviewsForCard(cardId: string) {
  return db.reviewHistory.where('cardId').equals(cardId).sortBy('timestamp');
}

describe('LearnMode course/lesson scope', () => {
  beforeEach(async () => {
    await Promise.all([
      db.courses.clear(),
      db.lessons.clear(),
      db.cards.clear(),
      db.schedulingUnits.clear(),
      db.sessionHistory.clear(),
      db.userPerformance.clear(),
      db.lessonCards.clear(),
      db.lessonCardExposures.clear(),
      db.lessonCompletions.clear(),
      db.practiceNodes.clear(),
      db.practiceMilestones.clear(),
      db.courseAssessments.clear(),
      db.revisionPlans.clear(),
      db.noteAnnotations.clear(),
      db.sequences.clear(),
      db.reviewHistory.clear(),
    ]);
    localStorage.clear();
  });

  it('waits for line-sequence classification before serving a line-specific prompt', async () => {
    const course = await createCourse('Drama');
    const lesson = await createLesson(course.id, 'Scene one');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Scene one',
      [
        { id: 'line-1', value: 'Where are you?' },
        { id: 'line-2', value: 'I am here.' },
      ],
      { mode: 'lines' },
    );
    const sequenceCards = await cardsForSequence(sequence);
    const firstCard = sequenceCards.find((card) => card.sequenceItemId === 'line-1');
    expect(firstCard).toBeDefined();
    await db.cards.delete(firstCard!.id);

    const lineMap = await linesModeCards.linesModeSequencesByCard(
      sequenceCards.filter((card) => card.id !== firstCard!.id),
    );
    let resolveLineMap!: (map: Map<string, typeof sequence>) => void;
    const delayedLineMap = new Promise<Map<string, typeof sequence>>((resolve) => {
      resolveLineMap = resolve;
    });
    const lookup = vi
      .spyOn(linesModeCards, 'linesModeSequencesByCard')
      .mockReturnValue(delayedLineMap);

    try {
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

      expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument();
      await act(async () => resolveLineMap(lineMap));
      await continueFromNotes();
      expect(await screen.findByText('Next line?')).toBeInTheDocument();
      expect(screen.queryByText('Next item?')).not.toBeInTheDocument();
    } finally {
      lookup.mockRestore();
    }
  });

  it('teaches a lesson in Simple mode and records only lesson-scoped exposure', async () => {
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
        if ((await db.lessonCardExposures.where('lessonId').equals(lesson.id).count()) === 1)
          return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });
    expect(await db.lessonCardExposures.where('lessonId').equals(lesson.id).count()).toBe(1);
    expect(await db.sessionHistory.count()).toBe(0);
    expect((await db.cards.toArray())[0].state).toBe(0);
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
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson1.id}/learn`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    await screen.findByRole('heading', { name: 'Kinematics' });
    await continueFromNotes();
    await answerYesAndWaitForExposure(lesson1.id);
    await screen.findByRole('heading', {
      name: /Nice work|reached your goal|Time.s up|hit your daily limit/i,
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
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lessonB.id}/learn`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    const notesUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(notesUnload);
    expect(notesUnload.defaultPrevented).toBe(false);
    await continueFromNotes();
    expect(await screen.findByText(/Shared Q/)).toBeInTheDocument();
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
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    await continueFromNotes();
    expect(await screen.findByText(/New Q/)).toBeInTheDocument();
    expect(screen.queryByText(/Reviewed Q/)).not.toBeInTheDocument();
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
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    await continueFromNotes();
    const seen = new Set<string>();
    for (let index = 0; index < 3; index++) {
      const card = await screen.findByText(/^(Due Q|Not Due Q|New Q)$/);
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
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    await continueFromNotes();
    const seen = new Set<string>();
    for (let index = 0; index < 3; index++) {
      const card = await screen.findByText(/^(Due Q|Not Due Q|New Q)$/);
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
        <ToastProvider>
          <MemoryRouter initialEntries={[`/course/${course.id}/learn`]}>
            <Routes>
              <Route path="/course/:courseId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
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
          <ToastProvider>
            <MemoryRouter initialEntries={[`/lesson/${lesson1.id}/learn`]}>
              <Routes>
                <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </ThemeProvider>,
      );

      await screen.findByRole('heading', { name: 'First' });
      await continueFromNotes();
      await answerYesAndWaitForExposure(lesson1.id);
      await screen.findByRole('heading', {
        name: /Nice work|reached your goal|Time.s up|hit your daily limit/i,
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

  it('ignores the retired mode=cram query entry', async () => {
    const course = await createCourse('Classics');
    const lesson = await createLesson(course.id, 'Athens');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Agora', 'Market');
    await upsertLessonCardExposure(lesson.id, card.id);

    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/course/${course.id}/learn?mode=cram`]}>
            <Routes>
              <Route path="/course/:courseId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText(/Classics/)).toBeInTheDocument();
    expect(screen.queryByText(/Cram mode|Weakest cards first/)).not.toBeInTheDocument();
  });

  it('uses the selected assessment scope in the ordinary Practice player', async () => {
    const course = await createCourse('History');
    const includedLesson = await createLesson(course.id, 'Revolutions');
    const unrelatedLesson = await createLesson(course.id, 'Empires');
    const included = await createLessonCard(
      course.id,
      includedLesson.id,
      'front_back',
      'Assessment question',
      'Answer',
    );
    const unrelated = await createLessonCard(
      course.id,
      unrelatedLesson.id,
      'front_back',
      'Unrelated question',
      'Answer',
    );
    await Promise.all([
      upsertLessonCardExposure(includedLesson.id, included.id),
      upsertLessonCardExposure(unrelatedLesson.id, unrelated.id),
    ]);
    const assessment = await createCourseAssessment(
      course.id,
      'Revolutions paper',
      Date.now() + 86_400_000,
      {
        afterLessonId: unrelatedLesson.id,
        coverageMode: 'custom',
        lessonIds: [includedLesson.id],
      },
    );

    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter>
            <LearnMode
              sessionId="flow-session-1"
              request={{
                kind: 'practice',
                courseId: course.id,
                mode: 'assessment',
                assessmentId: assessment.id,
              }}
            />
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Revolutions paper')).toBeInTheDocument();
    expect(await screen.findByText(/Assessment question/)).toBeInTheDocument();
    expect(screen.queryByText(/Unrelated question/)).not.toBeInTheDocument();

    await answerYes();
    await waitFor(async () => {
      const [review] = await storedReviewsForCard(included.id);
      expect(review).toEqual(
        expect.objectContaining({
          eventId: expect.any(String),
          sessionId: 'flow-session-1',
          sessionKind: 'assessment-revision',
          correct: true,
        }),
      );
      expect(await db.sessionHistory.toArray()).toEqual([
        expect.objectContaining({
          eventId: review?.eventId,
          sessionId: 'flow-session-1',
        }),
      ]);
    });
  });

  it('runs a persisted assessment window through the existing player with provenance and a factual summary', async () => {
    const course = await createCourse('Geography');
    const lesson = await createLesson(course.id, 'Rivers');
    const card = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'What is erosion?',
      'Wear',
    );
    await upsertLessonCardExposure(lesson.id, card.id);
    const assessment = await createCourseAssessment(
      course.id,
      'Physical geography',
      Date.now() + 86_400_000,
      { afterLessonId: lesson.id, coverageMode: 'prefix' },
    );
    const plan = await createOrResumeRevisionPlan(assessment.id, 20, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });
    const onStepFinished = vi.fn();

    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter>
            <LearnMode
              sessionId="revision-session-1"
              request={{
                kind: 'practice',
                courseId: course.id,
                mode: 'assessment',
                assessmentId: assessment.id,
                planId: plan.id,
                windowId: plan.windows[0].id,
              }}
              onStepFinished={onStepFinished}
            />
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByRole('heading', { name: /Revision plan/ })).toBeInTheDocument();
    expect(screen.queryByText(/Ordinary Practice ordering/)).not.toBeInTheDocument();
    expect(await screen.findByText(/What is erosion/)).toBeInTheDocument();
    await answerYes();

    await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
    expect(onStepFinished.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        reachedGoal: true,
        revision: expect.objectContaining({
          cardsCovered: 1,
          cardsImproved: 1,
          workNotReached: 0,
        }),
      }),
    );
    const reviews = await storedReviewsForCard(card.id);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toEqual(
      expect.objectContaining({
        sessionId: 'revision-session-1',
        revisionPlanId: plan.id,
        revisionWindowId: plan.windows[0].id,
      }),
    );
    const storedPlan = await db.revisionPlans.get(plan.id);
    expect(storedPlan?.completedSessions[0]).toEqual(
      expect.objectContaining({
        cardIds: [card.id],
        improvedCardIds: [card.id],
        reviewEventIds: [reviews[0].eventId],
      }),
    );
    expect(await db.practiceMilestones.count()).toBe(0);
  });

  it('parks a failed card when its productive FSRS retry falls outside the active window', async () => {
    const course = await createCourse('French');
    const lesson = await createLesson(course.id, 'Vocabulary');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'bonjour', 'hello');
    await upsertLessonCardExposure(lesson.id, card.id);
    const assessment = await createCourseAssessment(
      course.id,
      'Speaking',
      Date.now() + 86_400_000,
      {
        afterLessonId: lesson.id,
        coverageMode: 'prefix',
      },
    );
    const plan = await createOrResumeRevisionPlan(assessment.id, 0.1, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });
    const onStepFinished = vi.fn();
    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter>
            <LearnMode
              request={{
                kind: 'practice',
                courseId: course.id,
                mode: 'assessment',
                assessmentId: assessment.id,
                planId: plan.id,
                windowId: plan.windows[0].id,
              }}
              onStepFinished={onStepFinished}
            />
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    const revealCandidates = await screen.findAllByRole('button', { name: /show answer/i });
    fireEvent.click(revealCandidates.find((element) => element.tagName === 'BUTTON')!);
    expect(await screen.findByText('hello')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^no$/i }));

    await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
    expect(onStepFinished.mock.calls[0][0].revision).toEqual(
      expect.objectContaining({ cardsCovered: 1, cardsImproved: 0, cardsParked: 1 }),
    );
    expect((await db.revisionPlans.get(plan.id))?.completedSessions[0].parkedCardIds).toEqual([
      card.id,
    ]);
  });

  it('starts in Focus Mode from the persisted preference and Esc leaves it for this session', async () => {
    localStorage.setItem('lacuna.startInFocusMode', 'on');
    const course = await createCourse('Physics');
    const lesson = await createLesson(course.id, 'Forces');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');

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

    await continueFromNotes();
    expect(await screen.findByRole('button', { name: 'Show study controls' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exit Focus Mode' })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    // Entering focus mode now lives in the card-actions menu, so leaving it is observed
    // by the study chrome becoming permanently visible rather than by a header toggle.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Show study controls' })).not.toBeInTheDocument();
    });
    expect(localStorage.getItem('lacuna.startInFocusMode')).toBe('on');
  });

  it('tracks current, wrong and correct cards as in-session progress', async () => {
    const course = await createCourse('Computing');
    const lesson = await createLesson(course.id, 'Rendering');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Question one', 'Answer one');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Question two', 'Answer two');

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

  it('shows scheduler progress instead of latest-answer progress in a global objective session', async () => {
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
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(
      await screen.findByRole('progressbar', { name: 'Predicted score progress' }),
    ).toHaveAttribute('aria-valuenow', String(expected));
    expect(screen.queryByLabelText('Card progress')).not.toBeInTheDocument();
  });

  it('keeps practice-session chrome mounted while Yes and No replace the card surface', async () => {
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
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    const progress = await screen.findByRole('progressbar', { name: 'Predicted score progress' });
    const header = progress.closest('header');
    const firstSurface = document.querySelector<HTMLElement>('[data-study-card-id]');
    expect(header).not.toBeNull();
    expect(firstSurface).not.toBeNull();

    await answerNo();
    await waitFor(() => {
      const next = document.querySelector<HTMLElement>('[data-study-card-id]');
      expect(next?.dataset.studyCardId).not.toBe(firstSurface?.dataset.studyCardId);
      expect(screen.getByRole('progressbar', { name: 'Predicted score progress' })).toBe(progress);
      expect(progress.closest('header')).toBe(header);
    });

    const secondSurface = document.querySelector<HTMLElement>('[data-study-card-id]');
    await answerYes();
    await waitFor(() => {
      const next = document.querySelector<HTMLElement>('[data-study-card-id]');
      expect(next?.dataset.studyCardId).not.toBe(secondSurface?.dataset.studyCardId);
      expect(screen.getByRole('progressbar', { name: 'Predicted score progress' })).toBe(progress);
      expect(progress.closest('header')).toBe(header);
    });
    await waitFor(async () => expect(await db.sessionHistory.count()).toBe(1));
  });

  it('offers Undo after an ordinary button answer and reverses that review', async () => {
    const deck = await createCourse('Undo controls');
    await createCard(deck.id, 'front_back', 'First undo question', 'Answer');
    await createCard(deck.id, 'front_back', 'Second undo question', 'Answer');

    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    const firstQuestion = (await screen.findByText(/undo question/i)).textContent;
    await answerYes();
    expect(await screen.findByText(/^(Easy|Good|Hard) · \d+% recall at exam$/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(async () => expect(await db.reviewHistory.count()).toBe(0));
    expect(await screen.findByText(firstQuestion ?? '')).toBeInTheDocument();
  });

  it('does not offer Undo after the answer has finished the session', async () => {
    const deck = await createCourse('Terminal answer');
    await createCard(deck.id, 'front_back', 'Only question', 'Answer');

    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    await screen.findByText('Only question');
    await answerYes();

    expect(
      await screen.findByRole('heading', {
        name: /Nice work|reached your goal|Time.s up|hit your daily limit/i,
      }),
    ).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(await db.reviewHistory.count()).toBe(1);
  });

  it('checks a numeric answer and records full marks without self-grading', async () => {
    const performanceNow = vi.spyOn(performance, 'now').mockReturnValue(0);
    const deck = await createCourse('Numeric deck');
    const card = await createCard(deck.id, 'front_back', 'What is 8 / 2?', '', [], {
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
    });

    try {
      render(
        <ThemeProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </ThemeProvider>,
      );

      fireEvent.change(await screen.findByLabelText('Your answer'), {
        target: { value: '8 / 2' },
      });
      expect(screen.queryByRole('button', { name: /^yes$/i })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
      fireEvent.click(screen.getByRole('button', { name: 'The checker got this wrong' }));
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(async () => {
        expect((await storedReviewsForCard(card.id))[0]).toMatchObject({
          grade: 4,
          correct: true,
          marksEarned: 1,
          marksAvailable: 1,
          checkerDisputes: [
            {
              question: 'What is 8 / 2?',
              studentLine: '8 / 2',
              verdict: { correct: true, marksEarned: 1 },
              checkerSeeds: [],
            },
          ],
        });
      });
    } finally {
      performanceNow.mockRestore();
    }
  });

  it('grades an incorrect numeric answer as Again and clears it for the retry', async () => {
    const deck = await createCourse('Numeric retry deck');
    const card = await createCard(deck.id, 'front_back', 'What is 3 squared?', '', [], {
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '9' } },
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    const input = await screen.findByLabelText('Your answer');
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(async () => {
      expect((await storedReviewsForCard(card.id))[0]).toMatchObject({
        grade: 1,
        correct: false,
        marksEarned: 0,
        marksAvailable: 1,
      });
    });
    expect(await screen.findByLabelText('Your answer')).toHaveValue('');
  });

  it('checks working lines and persists full marks with their verdicts', async () => {
    const performanceNow = vi.spyOn(performance, 'now').mockReturnValue(0);
    const deck = await createCourse('Working deck');
    const card = await createCard(deck.id, 'front_back', 'Solve 2x = 8.', '', [], {
      payload: {
        v: 1,
        kind: 'working',
        scheme: [
          { marks: 1, label: 'substitution', kind: 'waypoint', expression: '2x = 8' },
          { marks: 2, label: 'answer', kind: 'predicate', predicate: 'equals', args: ['4'] },
        ],
      },
    });
    try {
      render(
        <ThemeProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/learn']}>
              <Routes>
                <Route path="/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </ThemeProvider>,
      );
      fireEvent.change(await screen.findByLabelText('Your working'), {
        target: { value: '2x = 8\n4' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Check working' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'The checker got this wrong for line 1' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(async () => {
        expect((await storedReviewsForCard(card.id))[0]).toMatchObject({
          grade: 4,
          correct: true,
          marksEarned: 3,
          marksAvailable: 3,
          lineVerdicts: [
            { studentLine: '2x = 8', matchedLineIndex: 0, marksEarned: 1 },
            { studentLine: '4', matchedLineIndex: 1, marksEarned: 2 },
          ],
          checkerDisputes: [
            {
              question: 'Solve 2x = 8.',
              studentLine: '2x = 8',
              verdict: { correct: true, marksEarned: 1, matchedLineIndex: 0 },
              checkerSeeds: [`${card.id}:0:0`],
            },
          ],
        });
      });
    } finally {
      performanceNow.mockRestore();
    }
  });

  it('grades partial working as Again and clears it for the retry', async () => {
    const deck = await createCourse('Working retry deck');
    const card = await createCard(deck.id, 'front_back', 'Solve 2x = 8.', '', [], {
      payload: {
        v: 1,
        kind: 'working',
        scheme: [
          { marks: 1, label: 'substitution', kind: 'waypoint', expression: '2x = 8' },
          { marks: 2, label: 'answer', kind: 'predicate', predicate: 'equals', args: ['4'] },
        ],
      },
    });
    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Your working'), { target: { value: '2x = 8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check working' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(async () => {
      expect((await storedReviewsForCard(card.id))[0]).toMatchObject({
        grade: 1,
        correct: false,
        marksEarned: 1,
        marksAvailable: 3,
      });
    });
    expect(await screen.findByLabelText('Your working')).toHaveValue('');
  });

  it('renders a scaffold-kind item read-only, with no grading affordance and an empty history', async () => {
    const deck = await createCourse('Scaffold deck');
    const card = await createCard(deck.id, 'front_back', 'Solve 2x = 8 by scaffold.', '', [], {
      payload: { v: 1, kind: 'scaffold' },
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Solve 2x = 8 by scaffold.')).toBeInTheDocument();
    expect(
      await screen.findByText(
        /can’t study this item yet — this version doesn’t support its format\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^yes$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^no$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show answer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    expect(await storedReviewsForCard(card.id)).toHaveLength(0);
  });

  it('falls back to the read-only face for an unknown payload version, not just an unknown kind', async () => {
    const deck = await createCourse('Unknown version deck');
    await createCard(deck.id, 'front_back', 'What is 8 / 2?', '', [], {
      // A hypothetical future `v: 2` numeric payload — the version guard, not the
      // kind check, is what must catch this.
      payload: { v: 2, kind: 'numeric', answer: { kind: 'exact', value: '4' } } as never,
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('What is 8 / 2?')).toBeInTheDocument();
    expect(
      await screen.findByText(
        /can’t study this item yet — this version doesn’t support its format\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check answer' })).not.toBeInTheDocument();
  });

  it('buries a scaffold-kind item from its read-only face and advances the session', async () => {
    const deck = await createCourse('Scaffold bury deck');
    const card = await createCard(deck.id, 'front_back', 'Scaffold question', '', [], {
      payload: { v: 1, kind: 'scaffold' },
    });

    const { unmount } = render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Scaffold question')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Card actions' }));
    const bury = await screen.findByRole('button', { name: 'Bury until tomorrow' });
    await act(async () => {
      fireEvent.click(bury);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        if (screen.queryByText('Session complete')) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });

    expect(await screen.findByText('Session complete')).toBeInTheDocument();
    expect(await storedReviewsForCard(card.id)).toHaveLength(0);
    await act(async () => unmount());
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
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Available question')).toBeInTheDocument();
    expect(screen.queryByText('Suspended question')).not.toBeInTheDocument();
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
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn?filter=flagged']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Flagged question')).toBeInTheDocument();
    expect(screen.queryByText('Unflagged question')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Card progress')).not.toBeInTheDocument();
  });

  it('does not report a suspended-only filtered pool as completed', async () => {
    const deck = await createCourse('Suspended deck');
    const suspended = await createCard(deck.id, 'front_back', 'Suspended question', 'Answer');
    await db.cards.update(suspended.id, { suspended: true });

    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn?filter=suspended']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(
      await screen.findByText('No eligible cards matching suspended cards to study'),
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
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
          <ToastProvider>
            <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
              <Routes>
                <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </ThemeProvider>,
      );

      await continueFromNotes();
      fireEvent.click(await screen.findByRole('button', { name: 'Card actions' }));
      fireEvent.click(await screen.findByRole('button', { name: actionLabel }));

      expect(await screen.findByText('Session complete')).toBeInTheDocument();
      expect(screen.queryByText('Goal reached')).not.toBeInTheDocument();
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
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    await continueFromNotes();
    await answerYes();

    expect(await screen.findByText('Goal reached')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute(
        'aria-valuenow',
        '100',
      );
    });
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
          <ToastProvider>
            <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
              <Routes>
                <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </ThemeProvider>,
      );

      await continueFromNotes();
      fireEvent.click(await screen.findByRole('button', { name: 'Show study controls' }));
      const exitFocus = await screen.findByRole('button', { name: 'Exit Focus Mode' });
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
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Touch question')).toBeInTheDocument();
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
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText('Thumb question')).toBeInTheDocument();
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
        <ToastProvider>
          <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
            <Routes>
              <Route path="/lesson/:lessonId/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );

    await continueFromNotes();
    const revealCandidates = await screen.findAllByRole('button', { name: /show answer/i });
    fireEvent.click(revealCandidates.find((element) => element.tagName === 'BUTTON')!);
    expect(await screen.findByText('Visible answer')).toBeInTheDocument();

    await act(async () => {
      writeStartInFocusMode(true);
      // Allow the preference event and any accidentally-triggered async reload to settle.
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await waitFor(() => {
      expect(screen.getByText('Visible answer')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^yes$/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument();
  });

  it('resumes an interrupted Simple lesson from its reconciled card queue', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Industrial change');
    await createLessonCard(course.id, lesson.id, 'front_back', 'First cause', 'Steam power');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Second cause', 'Urbanisation');

    const firstRender = render(
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

    await continueFromNotes();
    await screen.findByText(/cause$/);
    expect(screen.queryByText('Loop until every card is correct')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Simple Learn' })).toBeInTheDocument();
    const firstServedId = document
      .querySelector('[data-study-card-id]')
      ?.getAttribute('data-study-card-id');
    await answerYesAndWaitForExposure(lesson.id);
    await waitFor(() => {
      expect(
        document.querySelector('[data-study-card-id]')?.getAttribute('data-study-card-id'),
      ).not.toBe(firstServedId);
    });
    const secondServedId = document
      .querySelector('[data-study-card-id]')
      ?.getAttribute('data-study-card-id');
    firstRender.unmount();

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

    await continueFromNotes();
    await waitFor(() => {
      expect(
        document.querySelector('[data-study-card-id]')?.getAttribute('data-study-card-id'),
      ).toBe(secondServedId);
    });
  });

  it('does not restore outcomes from a completed Simple pass after restarting', async () => {
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cell structure');
    const card = await createLessonCard(
      course.id,
      lesson.id,
      'front_back',
      'Cell control centre',
      'Nucleus',
    );

    const firstRender = render(
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

    await continueFromNotes();
    await answerYesAndWaitForExposure(lesson.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Keep studying' }));
    await waitFor(() => {
      const storageKey = [...Array(localStorage.length)]
        .map((_, index) => localStorage.key(index))
        .find((key) => key?.startsWith('lacuna.simpleSession.v1:'));
      expect(storageKey).toBeDefined();
      expect(JSON.parse(localStorage.getItem(storageKey!)!).outcomes).toEqual([]);
    });
    firstRender.unmount();

    expect(loadSimpleSession({ kind: 'lesson', lessonId: lesson.id }, [card.id])?.outcomes).toEqual(
      new Map(),
    );
  });

  it('guards an outstanding Card, keeps it mounted on Stay and clears resume on Leave', async () => {
    const course = await createCourse('Geography');
    const lesson = await createLesson(course.id, 'River processes');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Define erosion', 'Wearing away');
    const router = createMemoryRouter(
      [
        { path: '/lesson/:lessonId/learn', element: <LearnMode /> },
        {
          path: '/course/:courseId/lesson/:lessonId',
          element: <p>Lesson destination</p>,
        },
      ],
      { initialEntries: [`/lesson/${lesson.id}/learn`] },
    );
    render(
      <ThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </ToastProvider>
      </ThemeProvider>,
    );

    await continueFromNotes();
    expect(await screen.findByText('Define erosion')).toBeInTheDocument();
    expect(
      [...Array(localStorage.length)].some((_, index) =>
        localStorage.key(index)?.startsWith('lacuna.simpleSession.v1:'),
      ),
    ).toBe(true);

    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(await screen.findByRole('dialog', { name: 'Leave this session?' })).toHaveTextContent(
      '0 of 1 Card answered',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.getByText('Define erosion')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Lesson destination')).toBeInTheDocument();
    expect(
      [...Array(localStorage.length)].some((_, index) =>
        localStorage.key(index)?.startsWith('lacuna.simpleSession.v1:'),
      ),
    ).toBe(false);
  });
});
