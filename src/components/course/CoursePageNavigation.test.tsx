import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CoursePageNavigation } from './CoursePageNavigation';

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
