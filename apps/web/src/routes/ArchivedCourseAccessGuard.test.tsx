import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AnimatePresence, usePresence } from 'motion/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useLocation,
  useOutlet,
} from 'react-router-dom';
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

function RetainedPage({ children }: { children: ReactNode }) {
  // Hold the outgoing page through navigation without depending on animation timing.
  usePresence();
  return <>{children}</>;
}

function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence mode="wait">
      <RetainedPage key={location.pathname}>{outlet}</RetainedPage>
    </AnimatePresence>
  );
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
  it.each(['/', '/archived', '/settings', '/course/course-2/cards', '/learn'])(
    'does not redirect navigation to %s while the archived page exits',
    async (destination) => {
      const router = createMemoryRouter(
        [
          {
            element: <AnimatedOutlet />,
            children: [
              {
                path: '/course/:courseId',
                element: (
                  <ArchivedCourseAccessGuard>
                    <p>Archived overview</p>
                  </ArchivedCourseAccessGuard>
                ),
              },
              { path: '*', element: <p>Destination</p> },
            ],
          },
        ],
        { initialEntries: ['/course/course-1'] },
      );
      render(<RouterProvider router={router} />);
      const navigate = router.navigate.bind(router);
      // Record redirects without letting the broken guard create an endless loop.
      const redirect = vi.spyOn(router, 'navigate').mockResolvedValue();
      await act(async () => {
        await navigate(destination);
      });

      expect(screen.getByText('Archived overview')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(destination);
      expect(redirect).not.toHaveBeenCalled();
    },
  );

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
