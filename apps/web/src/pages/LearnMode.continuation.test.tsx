import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LazyMotion, domAnimation } from 'motion/react';
import { ToastProvider } from '../components/ui/Toast';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import { db } from '../db/schema';
import { ThemeProvider } from '../state/ThemeContext';
import { AccentProvider } from '../state/AccentContext';
import type * as MotionSpeedModule from '../state/motionSpeed';
import type * as CourseStudyFlowModule from '../state/useCourseStudyFlow';
import { LearnMode } from './LearnMode';
import { CourseStudyFlow } from './CourseStudyFlow';

vi.mock('motion/mini', () => ({ animate: vi.fn(() => ({ stop: vi.fn() })) }));

let motionMultiplier = 0;
let holdPlanner = false;

vi.mock('../state/useCourseStudyFlow', async (importOriginal) => {
  const actual = await importOriginal<typeof CourseStudyFlowModule>();
  return {
    ...actual,
    useCourseStudyFlow: (...args: Parameters<typeof actual.useCourseStudyFlow>) => {
      const flow = actual.useCourseStudyFlow(...args);
      return holdPlanner && (args[1] ?? 0) > 0 ? undefined : flow;
    },
  };
});

vi.mock('../state/motionSpeed', async (importOriginal) => ({
  ...(await importOriginal<typeof MotionSpeedModule>()),
  speedMultiplier: () => motionMultiplier,
}));

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
  motionMultiplier = 0;
  holdPlanner = false;
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
    motionMultiplier = 1;
    holdPlanner = true;
    const course = await dueCourse();
    const reports: string[] = [];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const report = node.matches('main[aria-label="Session report"]')
            ? node
            : node.querySelector('main[aria-label="Session report"]');
          if (report) reports.push(report.querySelector('h1')?.textContent ?? 'Session report');
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const flow = () => (
      <LazyMotion features={domAnimation}>
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
        </ThemeProvider>
      </LazyMotion>
    );
    const view = render(flow());
    await answerManually();
    // The post-step IndexedDB read can outlast both exit animations. The
    // completed Learn instance must not substitute its standalone report.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(reports).toEqual([]);
    holdPlanner = false;
    view.rerender(flow());
    await screen.findByRole('button', { name: 'Finish for now' });
    expect(screen.queryByRole('main', { name: 'Session report' })).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-study-entrance]')).toBeNull());
    observer.disconnect();
    expect(reports).toEqual([]);
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
