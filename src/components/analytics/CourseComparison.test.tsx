import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CourseComparison } from './CourseComparison';
import type { Course, Card } from '../../db/types';

vi.mock('./useChartColours', () => ({
  useChartColours: () => ({
    accent: '#000',
    ink: '#000',
    inkSoft: '#000',
    inkFaint: '#000',
    line: '#000',
    positive: '#000',
    surface: '#fff',
  }),
}));

const courses = [
  { id: 'course-a', name: 'Course A' },
  { id: 'course-b', name: 'Course B' },
] as Course[];

const cards: Card[] = [];

describe('CourseComparison', () => {
  it('links each compared course name to its own analytics page', () => {
    render(<CourseComparison courses={courses} cards={cards} />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText('First course'), { target: { value: 'course-a' } });
    fireEvent.change(screen.getByLabelText('Second course'), { target: { value: 'course-b' } });

    expect(screen.getByRole('link', { name: /Course A/ })).toHaveAttribute(
      'href',
      '/course/course-a/analytics',
    );
    expect(screen.getByRole('link', { name: /Course B/ })).toHaveAttribute(
      'href',
      '/course/course-b/analytics',
    );
  });
});
