import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard, createLesson } from '../db/repository';
import { db } from '../db/schema';
import { ToastProvider } from '../components/ui/Toast';
import { CoursePath } from './CoursePath';

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => 0,
}));
vi.mock('../components/learn/StudySheetContext', () => ({
  useStudySheet: () => ({ openStudySheet: vi.fn() }),
}));
vi.mock('../components/cards/LessonCardsSection', () => ({ LessonCardsSection: () => null }));
vi.mock('../components/course/CourseHeader', () => ({
  CourseHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
}));
vi.mock('../components/course/CoursePathSegment', () => ({
  PathNodeWithLine: () => null,
  lockHintFor: () => undefined,
}));

beforeEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(db.tables.map((table) => table.clear()));
});

it('opens the Path with live due counts without reading review history', async () => {
  const course = await createCourse('Biology', { dailyReviewGoal: 2 });
  await createLesson(course.id, 'Cells');
  await createLesson(course.id, 'Genetics');
  const card = await createCourseCard(course.id, 'front_back', 'Cell', 'Unit of life');
  await db.cards.update(card.id, { state: 2, due: Date.now() - 1 });
  const history = vi.spyOn(db.reviewHistory, 'where');
  const activity = vi.spyOn(db.reviewActivity, 'toArray');
  render(
    <MemoryRouter initialEntries={[`/course/${course.id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/course/:courseId" element={<CoursePath />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Study' });
  expect(screen.getByRole('img', { name: '1 card due today' })).toBeInTheDocument();
  expect.soft(history).not.toHaveBeenCalled();
  expect.soft(activity).not.toHaveBeenCalled();

  await db.cards.update(card.id, { suspended: true });
  expect(await screen.findByRole('img', { name: 'Nothing due today' })).toBeInTheDocument();
});

it('renders a revisited course immediately while its live query revalidates', async () => {
  const course = await createCourse('Revisit');
  await createLesson(course.id, 'Cells');
  await createLesson(course.id, 'Genetics');
  function Page() {
    return (
      <MemoryRouter initialEntries={[`/course/${course.id}`]}>
        <ToastProvider>
          <Routes>
            <Route path="/course/:courseId" element={<CoursePath />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    );
  }
  const first = render(<Page />);
  await screen.findByRole('button', { name: 'Study' });
  first.unmount();
  render(<Page />);
  expect(screen.getByRole('button', { name: 'Study' })).toBeInTheDocument();
});
