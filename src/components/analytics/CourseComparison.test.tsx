import { expectAppDestination } from '../../../tests/helpers/expectAppDestination';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CourseComparison } from './CourseComparison';
import type { Course, Card } from '../../db/types';
import { defaultFsrsParameters } from '../../fsrs/params';

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

    expectAppDestination(
      screen.getByRole('link', { name: /Course A/ }),
      '/course/course-a/analytics',
    );
    expectAppDestination(
      screen.getByRole('link', { name: /Course B/ }),
      '/course/course-b/analytics',
    );
  });

  it('counts leeches against each course threshold, not the card position', () => {
    const fresh = { id: 'fresh', courseId: 'course-a', lapses: 0, history: [] } as unknown as Card;
    const lapsed = {
      id: 'lapsed',
      courseId: 'course-b',
      lapses: 3,
      history: [],
    } as unknown as Card;
    render(
      <CourseComparison
        courses={[
          { ...courses[0], fsrsParameters: defaultFsrsParameters() },
          { ...courses[1], fsrsParameters: defaultFsrsParameters(), leechThreshold: 3 },
        ]}
        cards={[fresh, lapsed]}
      />,
      { wrapper: MemoryRouter },
    );

    fireEvent.change(screen.getByLabelText('First course'), { target: { value: 'course-a' } });
    fireEvent.change(screen.getByLabelText('Second course'), { target: { value: 'course-b' } });

    const row = screen.getByText('Leech cards').parentElement!;
    expect(within(row).getByLabelText('Course A leads')).toBeInTheDocument();
  });
});
