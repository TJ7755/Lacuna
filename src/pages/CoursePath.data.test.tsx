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
vi.mock('../components/course/CourseHeader', () => ({
  CourseHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
}));
vi.mock('../components/course/CoursePathSegment', () => ({
  PathNodeWithLine: () => null,
  lockHintFor: () => undefined,
}));

beforeEach(async () => {
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
