import 'fake-indexeddb/auto';
import {
  answerYes,
  answerYesAndWaitForExposure,
  continueFromNotes,
  studyFaceText,
  findStudyFaceText,
  resetLearnModeFixtures,
} from './LearnMode.testFixtures';
import { LearnMode } from './LearnMode';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from 'react-router-dom';
import { db } from '../db/schema';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { ToastProvider } from '../components/ui/Toast';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
import { loadSimpleSession } from './learn/simpleSessionPersistence';
describe('LearnMode resume', () => {
  beforeEach(resetLearnModeFixtures);

  it('shuffles the fresh Keep studying pass and saves that queue order', async () => {
    const course = await createCourse('Repeat pass');
    const lesson = await createLesson(course.id, 'Facts');
    for (const front of ['First fact', 'Second fact', 'Third fact']) {
      await createLessonCard(course.id, lesson.id, 'front_back', front, 'Answer');
    }
    const cards = await db.cards.where('courseId').equals(course.id).toArray();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    try {
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
      for (const card of cards) {
        await findStudyFaceText(card.front);
        await answerYes();
      }
      const keepStudying = await screen.findByRole('button', { name: 'Keep studying' });
      random.mockReturnValue(0);
      fireEvent.click(keepStudying);
      const expected = [cards[1].id, cards[2].id, cards[0].id];
      await waitFor(() =>
        expect(
          loadSimpleSession({ kind: 'lesson', lessonId: lesson.id, standalone: true }, expected),
        ).toMatchObject({
          queueCardIds: expected,
          masteredCardIds: [],
          outcomes: new Map(),
          events: [],
        }),
      );
      await findStudyFaceText(cards[1].front);
      await answerYes();
      await findStudyFaceText(cards[2].front);
      await answerYes();
      await findStudyFaceText(cards[0].front);
    } finally {
      random.mockRestore();
    }
  }, 15_000);

  it('resumes an interrupted Simple lesson from its reconciled card queue', async () => {
    const course = await createCourse('History');
    const lesson = await createLesson(course.id, 'Industrial change');
    await createLessonCard(course.id, lesson.id, 'front_back', 'First cause', 'Steam power');
    await createLessonCard(course.id, lesson.id, 'front_back', 'Second cause', 'Urbanisation');

    const firstRender = render(
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
    await findStudyFaceText(/cause$/);
    expect(screen.queryByText('Loop until every card is correct')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Industrial change' })).toBeInTheDocument();
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

  it('guards an outstanding Card, keeps it mounted on Stay and keeps resume on Leave', async () => {
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
        <AccentProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );

    await continueFromNotes();
    expect(await findStudyFaceText('Define erosion')).toBeInTheDocument();
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
      '0 of 1 Card answered. Your recorded answers are safe. You can continue studying when you return, but lesson notes may appear again.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(studyFaceText('Define erosion')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(await screen.findByText('Lesson destination')).toBeInTheDocument();
    expect(
      [...Array(localStorage.length)].some((_, index) =>
        localStorage.key(index)?.startsWith('lacuna.simpleSession.v1:'),
      ),
    ).toBe(true);
  });
});
