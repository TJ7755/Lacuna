import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CourseSectionBar } from './CourseSectionBar';

describe('CourseSectionBar', () => {
  it('renders all five course sections and marks Questions active', () => {
    render(
      <MemoryRouter initialEntries={['/course/course-1/questions']}>
        <CourseSectionBar />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Questions' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Cards' })).toHaveAttribute(
      'href',
      '/course/course-1/cards',
    );
  });
});
