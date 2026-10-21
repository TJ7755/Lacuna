import { expectAppDestination } from '../../../tests/helpers/expectAppDestination';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CoursePageNavigation } from './CoursePageNavigation';
import type { CourseRecord } from '../../db/types';

const mocks = vi.hoisted(() => ({ updateCourse: vi.fn(), notify: vi.fn() }));
vi.mock('../../db/courseRepository', () => ({ updateCourse: mocks.updateCourse }));
vi.mock('../ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));

function renderNavigation(trailing?: ReactNode) {
  return render(
    <MemoryRouter>
      <CoursePageNavigation
        courseId="course-1"
        backTo="/"
        backLabel="All courses"
        trailing={trailing}
      />
    </MemoryRouter>,
  );
}

describe('CoursePageNavigation', () => {
  it('keeps the back destination and course-scoped tabs in one shared row', () => {
    renderNavigation();

    expectAppDestination(screen.getByRole('link', { name: 'All courses' }), '/');
    expectAppDestination(screen.getByRole('link', { name: 'Cards' }), '/course/course-1/cards');
  });
});

it('reports a rejected workspace-mode save', async () => {
  mocks.updateCourse.mockRejectedValueOnce(new Error('Storage unavailable'));
  render(
    <MemoryRouter>
      <CoursePageNavigation
        courseId="course-1"
        course={{ id: 'course-1', lessonViewMode: 'study' } as CourseRecord}
        backTo="/"
        backLabel="All courses"
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit mode' }));
  await waitFor(() =>
    expect(mocks.notify).toHaveBeenCalledWith(
      'Could not save workspace mode. Try again.',
      'negative',
    ),
  );
  expect(mocks.updateCourse).toHaveBeenCalledWith('course-1', { lessonViewMode: 'edit' });
});

it('hides the course name out of reach while the page title already shows it', () => {
  const identity = { name: 'Biology' };
  const { rerender } = render(
    <MemoryRouter>
      <CoursePageNavigation
        courseId="course-1"
        backTo="/"
        backLabel="All courses"
        identity={identity}
        identityHidden
      />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link', { name: 'Biology' })).not.toBeInTheDocument();

  rerender(
    <MemoryRouter>
      <CoursePageNavigation
        courseId="course-1"
        backTo="/"
        backLabel="All courses"
        identity={identity}
      />
    </MemoryRouter>,
  );
  const link = screen.getByRole('link', { name: 'Biology' });
  expectAppDestination(link, '/course/course-1');
  expect(link.closest('[data-course-page-navigation]')).toHaveClass(
    'sm:grid-cols-[minmax(0,1fr)_minmax(0,max-content)_minmax(0,1fr)]',
  );
  // The name stands alone: no coloured status dot beside it.
  expect(link.querySelector('[style]')).toBeNull();
});
