import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CourseTabs } from './CourseTabs';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/course/:courseId" element={<CourseTabs courseId="course-1" />} />
        <Route path="/course/:courseId/cards" element={<CourseTabs courseId="course-1" />} />
        <Route path="/course/:courseId/questions" element={<CourseTabs courseId="course-1" />} />
        <Route path="/course/:courseId/analytics" element={<CourseTabs courseId="course-1" />} />
        <Route path="/course/:courseId/settings" element={<CourseTabs courseId="course-1" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CourseTabs', () => {
  it('marks Path active on the course root route', () => {
    const { container } = renderAt('/course/course-1');
    const active = screen.getByRole('link', { name: 'Path' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Cards' })).not.toHaveAttribute('aria-current');
    expect(container.querySelectorAll('[data-course-tab-indicator]')).toHaveLength(1);
    expect(active.querySelector('[data-course-tab-indicator]')).not.toBeNull();
  });

  it('marks Cards active on the cards route (and not Path)', () => {
    renderAt('/course/course-1/cards');
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Path' })).not.toHaveAttribute('aria-current');
  });

  it('marks Questions active on the questions route', () => {
    renderAt('/course/course-1/questions');
    expect(screen.getByRole('link', { name: 'Questions' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Analytics active on the analytics route', () => {
    renderAt('/course/course-1/analytics');
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Settings active on the settings route', () => {
    renderAt('/course/course-1/settings');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  it('points each tab link at the right course-scoped route', () => {
    renderAt('/course/course-1');
    expect(screen.getByRole('link', { name: 'Path' })).toHaveAttribute('href', '/course/course-1');
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute(
      'href',
      '/course/course-1/cards',
    );
    expect(screen.getByRole('link', { name: 'Questions' })).toHaveAttribute(
      'href',
      '/course/course-1/questions',
    );
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
      'href',
      '/course/course-1/analytics',
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/course/course-1/settings',
    );
  });
});
