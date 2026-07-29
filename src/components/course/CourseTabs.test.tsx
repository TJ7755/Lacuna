import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CourseTabs } from './CourseTabs';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/course/:courseId" element={<CourseTabs courseId="course-1" />} />
        <Route path="/course/:courseId/bank" element={<CourseTabs courseId="course-1" />} />
        <Route path="/course/:courseId/analytics" element={<CourseTabs courseId="course-1" />} />
        <Route path="/course/:courseId/settings" element={<CourseTabs courseId="course-1" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CourseTabs', () => {
  it('marks Path active on the course root route', () => {
    renderAt('/course/course-1');
    expect(screen.getByRole('link', { name: 'Path' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Question bank' })).not.toHaveAttribute('aria-current');
  });

  it('marks Question bank active on the bank route (and not Path)', () => {
    renderAt('/course/course-1/bank');
    expect(screen.getByRole('link', { name: 'Question bank' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Path' })).not.toHaveAttribute('aria-current');
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
    expect(screen.getByRole('link', { name: 'Question bank' })).toHaveAttribute(
      'href',
      '/course/course-1/bank',
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
