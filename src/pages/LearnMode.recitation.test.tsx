import 'fake-indexeddb/auto';
import {
  continueFromNotes,
  queryStudyFaceText,
  storedReviewsForCard,
  resetLearnModeFixtures,
} from './LearnMode.testFixtures';
import { LearnMode } from './LearnMode';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom';
import { db } from '../db/schema';
import {
  cardsForSequence,
  createCourse,
  createLesson,
  createSequence,
  upsertLessonCardExposure,
} from '../db/repository';
import * as linesModeCards from '../db/linesModeCards';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
describe('LearnMode recitation', () => {
  beforeEach(resetLearnModeFixtures);

  it('waits for line-sequence classification before serving a recitation', async () => {
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

      expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument();
      await act(async () => resolveLineMap(lineMap));
      await continueFromNotes();
      // Lesson teaching learns lines-mode sequences by cumulative recitation.
      expect(await screen.findByRole('button', { name: /^recite$/i })).toBeInTheDocument();
      expect(screen.getByText('Where are you?')).toBeInTheDocument();
      expect(queryStudyFaceText('Next item?')).toBeUndefined();
    } finally {
      lookup.mockRestore();
    }
  });

  it('learns a lines-mode sequence by cumulative recitation with one review per line', async () => {
    const course = await createCourse('Drama Simple');
    const lesson = await createLesson(course.id, 'Scene two');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Scene two',
      [
        { id: 'line-1', value: 'Where are you?' },
        { id: 'line-2', value: 'I am here.' },
      ],
      { mode: 'lines' },
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
    fireEvent.click(await screen.findByRole('button', { name: /^recite$/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'line 1' }), {
      target: { value: 'Where is it?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^check$/i }));
    // Revealing never marks a line wrong; the learner decides.
    expect(screen.getByRole('button', { name: 'line 1: correct' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'line 1: correct' }));
    expect(screen.getByRole('button', { name: 'line 1: marked wrong' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Try again sends the chunk back to recall with line 1 still unlocked.
    fireEvent.click(screen.getByRole('button', { name: /^try again$/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'line 1' }), {
      target: { value: 'Where are you?' },
    });
    // A matching recitation still waits for the learner's mark.
    fireEvent.click(screen.getByRole('button', { name: /^check$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^all correct$/i }));

    // Line 2 is presented only once line 1 has passed, and the bar follows it.
    expect(await screen.findByText('I am here.')).toBeInTheDocument();
    const pips = () =>
      [...document.querySelectorAll('[data-session-card-status]')].map((pip) =>
        pip.getAttribute('data-session-card-status'),
      );
    await waitFor(() => expect(pips()).toEqual(['correct', 'current']));
    fireEvent.click(screen.getByRole('button', { name: /^recite$/i }));
    await waitFor(() => expect(pips()).toEqual(['correct', 'current']));
    expect(document.querySelector('[data-session-card-status=correct]')).toHaveClass(
      'border-accent',
    );
    expect(
      document.querySelector('[data-session-card-status=correct]')?.firstElementChild,
    ).toHaveClass('bg-positive');
    expect(screen.getByRole('progressbar', { name: 'Session progress' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'line 1' }), {
      target: { value: 'Where are you?' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'line 2' }), {
      target: { value: 'I am here.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^check$/i }));

    fireEvent.click(screen.getByRole('button', { name: /^all correct$/i }));
    await screen.findByRole('heading', {
      name: /Nice work|Goal reached|Time.s up|hit your daily limit/i,
    });
    const cards = await cardsForSequence(sequence);
    expect(cards).toHaveLength(2);
    const reviews = await db.reviewHistory
      .where('cardId')
      .anyOf(cards.map((card) => card.id))
      .toArray();
    expect(reviews).toHaveLength(2);
    expect(reviews.every((review) => review.input === undefined)).toBe(true);
    const gradeFor = (itemId: string) => {
      const card = cards.find((candidate) => candidate.sequenceItemId === itemId)!;
      return reviews.find((review) => review.cardId === card.id)?.grade;
    };
    expect(gradeFor('line-1')).toBe(1);
    expect(gradeFor('line-2')).toBe(3);
  });

  it('reviews a due lines-mode line by reciting its chunk', async () => {
    const course = await createCourse('Drama FSRS');
    const lesson = await createLesson(course.id, 'Scene three');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'Scene three',
      [
        { id: 'line-1', value: 'Where are you?' },
        { id: 'line-2', value: 'I am here.' },
      ],
      { mode: 'lines' },
    );
    const cards = await cardsForSequence(sequence);
    const now = Date.now();
    for (const card of cards) {
      await upsertLessonCardExposure(lesson.id, card.id);
      await db.cards.update(card.id, {
        state: 2,
        stability: 2,
        difficulty: 5,
        reps: 1,
        lastReviewed: now - 24 * 60 * 60 * 1000,
        due: now - 1,
      });
    }

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

    expect(await screen.findByText(/^Review from the start/)).toBeInTheDocument();
    // The served line is the last recitation box: its chunk is recited down to it.
    const boxes = [...document.querySelectorAll<HTMLTextAreaElement>('textarea[data-line]')];
    const dueBox = boxes.at(-1)!;
    const dueItemId = dueBox.dataset.line!;
    const dueLabel = dueBox.getAttribute('aria-label')!;
    fireEvent.click(screen.getByRole('button', { name: /^check$/i }));
    // Even a blank answer is marked manually.
    expect(screen.getByRole('button', { name: `${dueLabel}: correct` })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: `${dueLabel}: correct` }));
    expect(screen.getByRole('button', { name: `${dueLabel}: marked wrong` })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    const dueCard = cards.find((card) => card.sequenceItemId === dueItemId)!;
    await waitFor(async () => {
      const [review] = await storedReviewsForCard(dueCard.id);
      expect(review).toMatchObject({ grade: 1, correct: false });
    });
  });

  it('resumes a recitation at the line reached after leaving', async () => {
    const course = await createCourse('Poems');
    const lesson = await createLesson(course.id, 'Dickinson');
    await createSequence(
      course.id,
      lesson.id,
      'Because I could not stop',
      [
        { id: 'line-1', value: 'Because I could not stop for Death' },
        { id: 'line-2', value: 'He kindly stopped for me' },
      ],
      { mode: 'lines' },
    );
    const study = () => {
      const router = createMemoryRouter(
        [
          { path: '/lesson/:lessonId/learn', element: <LearnMode /> },
          { path: '/course/:courseId/lesson/:lessonId', element: <p>Lesson destination</p> },
        ],
        { initialEntries: [`/lesson/${lesson.id}/learn`] },
      );
      return render(
        <ThemeProvider>
          <AccentProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </AccentProvider>
        </ThemeProvider>,
      );
    };

    const first = study();
    await continueFromNotes();
    fireEvent.click(await screen.findByRole('button', { name: /^recite$/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'line 1' }), {
      target: { value: 'Because I could not stop for Death' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^check$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^all correct$/i }));
    expect(await screen.findByText('He kindly stopped for me')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Lesson destination')).toBeInTheDocument();
    first.unmount();

    study();
    await continueFromNotes();
    expect(await screen.findByText('He kindly stopped for me')).toBeInTheDocument();
    expect(screen.queryByText('Because I could not stop for Death')).not.toBeInTheDocument();
  });
});
