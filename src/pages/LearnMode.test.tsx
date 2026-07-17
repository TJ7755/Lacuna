import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LearnMode, LearnSkeleton } from './LearnMode';
import { db } from '../db/schema';
import {
  createCard,
  createCourse,
  createCourseAssessment,
  createDeck,
  createLesson,
  createLessonCard,
  createPracticeNode,
  createOrResumeRevisionPlan,
  linkCardToLesson,
  upsertLessonCardExposure,
} from '../db/repository';
import { makeSessionContext, sessionProgress } from '../fsrs/session';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { writeStartInFocusMode } from '../state/focusModePreference';

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

async function answerNo() {
  const revealCandidates = await screen.findAllByRole('button', { name: /show answer/i });
  fireEvent.click(revealCandidates.find((el) => el.tagName === 'BUTTON')!);
  fireEvent.click(await screen.findByRole('button', { name: /^no$/i }));
}

async function continueFromNotes() {
  fireEvent.click(await screen.findByRole('button', { name: /^continue$/i }));
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
      db.lessonCardExposures.clear(),
      db.lessonCompletions.clear(),
      db.practiceNodes.clear(),
      db.practiceMilestones.clear(),
      db.courseAssessments.clear(),
      db.revisionPlans.clear(),
      db.noteAnnotations.clear(),
    ]);
    localStorage.clear();
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
    fireEvent.click(screen.getByRole('button', { name: /^yes$/i }));

    await waitFor(async () => {
      expect(await db.lessonCardExposures.where('lessonId').equals(lesson.id).count()).toBe(1);
    });
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

    await screen.findByRole('heading', { name: 'Kinematics' });
    await continueFromNotes();
    await answerYes();

    await waitFor(async () => {
      expect(await db.lessonCardExposures.where('lessonId').equals(lesson1.id).count()).toBe(1);
    });
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
      await Promise.all([db.courses.clear(), db.lessons.clear(), db.cards.clear()]);
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
      await answerYes();

      await waitFor(async () => {
        expect(await db.lessonCardExposures.where('lessonId').equals(lesson1.id).count()).toBe(1);
      });
      await new Promise((r) => setTimeout(r, 50));
      expect((await db.lessons.get(lesson2.id))?.unlockedAt).toBeUndefined();
      unmount();
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
      const reviewed = await db.cards.get(included.id);
      expect(reviewed?.history[0]).toEqual(
        expect.objectContaining({
          eventId: expect.any(String),
          sessionId: 'flow-session-1',
          sessionKind: 'assessment-revision',
          correct: true,
        }),
      );
      expect(await db.sessionHistory.toArray()).toEqual([
        expect.objectContaining({
          eventId: reviewed?.history[0].eventId,
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

    expect(await screen.findByText(/Ordinary Practice ordering/)).toBeInTheDocument();
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
    const reviewed = await db.cards.get(card.id);
    expect(reviewed?.history).toHaveLength(1);
    expect(reviewed?.history[0]).toEqual(
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
        reviewEventIds: [reviewed?.history[0].eventId],
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

    expect(await screen.findByRole('button', { name: 'Enter Focus Mode' })).toBeInTheDocument();
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

    await answerNo();
    await waitFor(() => {
      expect(document.querySelectorAll('[data-session-card-status="wrong"]')).toHaveLength(1);
      expect(document.querySelectorAll('[data-session-card-status="current"]')).toHaveLength(1);
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
    const deck = await createDeck('Objective deck');
    await db.decks.update(deck.id, { examDate: now + 7 * 24 * 60 * 60 * 1000 });
    const configuredDeck = (await db.decks.get(deck.id))!;
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

  it('does not create rigid progress slots from unavailable cards outside Simple mode', async () => {
    const now = Date.now();
    const deck = await createDeck('Eligibility deck');
    await db.decks.update(deck.id, { examDate: now + 7 * 24 * 60 * 60 * 1000 });
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
    const deck = await createDeck('Filtered deck');
    await db.decks.update(deck.id, { examDate: now + 7 * 24 * 60 * 60 * 1000 });
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
    const deck = await createDeck('Suspended deck');
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
      expect(await screen.findByRole('button', { name: 'Enter Focus Mode' })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
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
});
