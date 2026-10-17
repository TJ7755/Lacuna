import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
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

it('reads one course card/history set for the path and its header summary', async () => {
  const course = await createCourse('Biology');
  await createLesson(course.id, 'Cells');
  await createLesson(course.id, 'Genetics');
  await createCourseCard(course.id, 'front_back', 'Cell', 'Unit of life');
  const cards = vi.spyOn(db.cards, 'where');
  const history = vi.spyOn(db.reviewHistory, 'where');
  const courses = vi.spyOn(db.courses, 'get');
  const assessments = vi.spyOn(db.courseAssessments, 'where');
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
  await waitFor(() => expect(cards).toHaveBeenCalledTimes(1));
  expect(history).toHaveBeenCalledTimes(1);
  expect(courses).toHaveBeenCalledTimes(1);
  expect(assessments).toHaveBeenCalledTimes(1);
});

it('reuses the ready course snapshot when arriving at a single lesson', async () => {
  const course = await createCourse('Arrival');
  await createLesson(course.id, 'Lesson 1');
  const cards = vi.spyOn(db.cards, 'where');
  render(
    <MemoryRouter initialEntries={[`/course/${course.id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/course/:courseId" element={<CoursePath />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Lesson 1' });
  expect(cards.mock.calls.filter(([index]: unknown[]) => index === 'courseId')).toHaveLength(1);
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
