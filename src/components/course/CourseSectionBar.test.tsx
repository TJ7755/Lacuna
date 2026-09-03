import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseSectionBar } from './CourseSectionBar';

const prefetchRoute = vi.hoisted(() => vi.fn());

vi.mock('../../routes/prefetch', () => ({ prefetchRoute }));

describe('CourseSectionBar', () => {
  beforeEach(() => prefetchRoute.mockClear());

  it('renders all five course sections and marks Questions active', () => {
    render(
      <MemoryRouter initialEntries={['/course/course-1/questions']}>
        <CourseSectionBar />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Questions' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Path' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute(
      'href',
      '/course/course-1/cards',
    );
  });

  it('marks only Cards current on the cards route', () => {
    render(
      <MemoryRouter initialEntries={['/course/course-1/cards']}>
        <CourseSectionBar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Path' })).not.toHaveAttribute('aria-current');
  });

  it('marks no section current on a route nested inside a section', () => {
    render(
      <MemoryRouter initialEntries={['/course/course-1/lesson/lesson-1']}>
        <CourseSectionBar />
      </MemoryRouter>,
    );

    for (const name of ['Path', 'Cards', 'Questions', 'Analytics', 'Settings']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current');
    }
  });

  it('prefetches a section on pointer hover, focus and pointerdown intent', () => {
    render(
      <MemoryRouter initialEntries={['/course/course-1']}>
        <CourseSectionBar />
      </MemoryRouter>,
    );
    const cards = screen.getByRole('link', { name: 'Cards' });

    fireEvent.pointerEnter(cards);
    fireEvent.focus(cards);
    fireEvent.pointerDown(cards);

    expect(prefetchRoute).toHaveBeenNthCalledWith(1, '/course/course-1/cards');
    expect(prefetchRoute).toHaveBeenNthCalledWith(2, '/course/course-1/cards');
    expect(prefetchRoute).toHaveBeenNthCalledWith(3, '/course/course-1/cards');
  });
});
