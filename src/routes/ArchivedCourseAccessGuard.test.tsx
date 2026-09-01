import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Course, Lesson } from '../db/types';
import { ArchivedCourseAccessGuard } from './ArchivedCourseAccessGuard';

let mockCourse: Course | null | undefined;
let mockLesson: Lesson | null | undefined;

vi.mock('../state/useCourseData', () => ({
  useCourse: () => mockCourse,
  useLesson: () => mockLesson,
}));

const course = {
  id: 'course-1',
  name: 'Archived course',
  archived: true,
} as Course;

const lesson = {
  id: 'lesson-1',
  courseId: 'course-1',
  name: 'Archived lesson',
} as Lesson;

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderGuardedRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route
          path="/course/:courseId/*"
          element={
            <ArchivedCourseAccessGuard>
              <p>Guarded content</p>
            </ArchivedCourseAccessGuard>
          }
        />
        <Route
          path="/lesson/:lessonId/*"
          element={
            <ArchivedCourseAccessGuard>
              <p>Guarded content</p>
            </ArchivedCourseAccessGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockCourse = course;
  mockLesson = lesson;
});

describe('ArchivedCourseAccessGuard', () => {
  it.each(['/course/course-1', '/course/course-1/lesson/lesson-1', '/course/course-1/analytics'])(
    'allows archived inspection at %s',
    (path) => {
      renderGuardedRoute(path);

      expect(screen.getByTestId('location')).toHaveTextContent(path);
      expect(screen.getByText('Guarded content')).toBeInTheDocument();
    },
  );

  it.each([
    '/course/course-1/bank',
    '/course/course-1/cards',
    '/course/course-1/questions',
    '/course/course-1/questions/new',
    '/course/course-1/questions/question-1/edit',
    '/course/course-1/cards/new',
    '/course/course-1/cards/card-1/edit',
    '/course/course-1/settings',
    '/course/course-1/updates',
    '/course/course-1/lesson/lesson-1/cards/new',
    '/course/course-1/lesson/lesson-1/cards/card-1/edit',
    '/course/course-1/sequence/new',
    '/course/course-1/sequence/sequence-1/edit',
    '/course/course-1/lesson/lesson-1/sequence/new',
    '/course/course-1/occlusion/new',
    '/course/course-1/occlusion/occlusion-1/edit',
    '/course/course-1/lesson/lesson-1/occlusion/new',
    '/course/course-1/questions/learn',
    '/course/course-1/study',
    '/course/course-1/learn',
    '/lesson/lesson-1/learn',
  ])('redirects archived study or mutation route %s to its course overview', async (path) => {
    renderGuardedRoute(path);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/course/course-1');
    });
  });

  it('leaves active-course routes available', () => {
    mockCourse = { ...course, archived: false };
    const path = '/course/course-1/cards';

    renderGuardedRoute(path);

    expect(screen.getByTestId('location')).toHaveTextContent(path);
    expect(screen.getByText('Guarded content')).toBeInTheDocument();
  });
});
