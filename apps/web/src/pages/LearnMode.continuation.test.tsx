import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { db } from '../db/schema';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
import type * as MotionSpeedModule from '../state/motionSpeed';
import { LearnMode } from './LearnMode';
import { CourseStudyFlow } from './CourseStudyFlow';

vi.mock('../state/motionSpeed', async (importOriginal) => ({
  ...(await importOriginal<typeof MotionSpeedModule>()),
  speedMultiplier: () => 0,
}));

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
});

async function dueCourse() {
  const course = await createCourse('Report continuation', { learnFirst: false });
  const lesson = await createLesson(course.id, 'Current lesson');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  await db.cards.update(card.id, {
    state: 2,
    stability: 0.1,
    difficulty: 5,
    reps: 5,
    lastReviewed: Date.now() - 86_400_000,
    due: Date.now() - 1,
  });
  return course;
}

async function answerManually() {
  fireEvent.click(await screen.findByText(/^show answer$/i, { selector: 'button' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
}

describe('embedded report continuation', () => {
  it('hands a real due-review Learn session back to CourseStudyFlow', async () => {
    const course = await dueCourse();
    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[`/course/${course.id}/study?review=due`]}>
              <Routes>
                <Route path="/course/:courseId/study" element={<CourseStudyFlow />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );
    await answerManually();
    await screen.findByRole('button', { name: 'Finish for now' });
    expect(screen.queryByRole('main', { name: 'Session report' })).not.toBeInTheDocument();
    expect(await db.reviewHistory.count()).toBe(1);
  });

  it('requests advancement from a retained confirmed report without committing again', async () => {
    const course = await dueCourse();
    const onStepFinished = vi.fn();
    render(
      <ThemeProvider>
        <AccentProvider>
          <ToastProvider>
            <MemoryRouter>
              <LearnMode
                request={{ kind: 'practice', courseId: course.id, mode: 'recurring' }}
                onStepFinished={onStepFinished}
              />
            </MemoryRouter>
          </ToastProvider>
        </AccentProvider>
      </ThemeProvider>,
    );
    await answerManually();
    await waitFor(() => expect(onStepFinished).toHaveBeenCalledOnce());
    await screen.findByRole('heading', { name: 'Goal reached.' });
    expect(screen.queryByRole('button', { name: 'Undo last answer' })).not.toBeInTheDocument();
    const before = await Promise.all([
      db.cards.toArray(),
      db.reviewHistory.toArray(),
      db.lessons.toArray(),
      db.practiceMilestones.toArray(),
      db.coursePerformance.toArray(),
    ]);
    const summary = onStepFinished.mock.calls[0][0];
    onStepFinished.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onStepFinished).toHaveBeenCalledExactlyOnceWith(summary));
    expect(
      await Promise.all([
        db.cards.toArray(),
        db.reviewHistory.toArray(),
        db.lessons.toArray(),
        db.practiceMilestones.toArray(),
        db.coursePerformance.toArray(),
      ]),
    ).toEqual(before);
  });
});
