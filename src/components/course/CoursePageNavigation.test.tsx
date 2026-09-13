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
  it('uses equal outer tracks so section navigation remains centred', () => {
    const { container } = renderNavigation(<button type="button">Author</button>);
    const navigation = container.querySelector('[data-course-page-navigation]');

    expect(navigation).toHaveClass('sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]');
    expect(screen.getByRole('navigation', { name: 'Course sections' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Author' })).toBeVisible();
  });

  it('keeps the back destination and course-scoped tabs in one shared row', () => {
    renderNavigation();

    expect(screen.getByRole('link', { name: 'All courses' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute(
      'href',
      '/course/course-1/cards',
    );
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
  fireEvent.click(screen.getByRole('button', { name: 'Author mode' }));
  await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith(
    'Could not save workspace mode. Try again.', 'negative',
  ));
  expect(mocks.updateCourse).toHaveBeenCalledWith('course-1', { lessonViewMode: 'edit' });
});
