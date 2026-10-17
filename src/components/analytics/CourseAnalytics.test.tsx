import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CourseAnalytics } from './CourseAnalytics';
import { defaultFsrsParameters, FSRS_VERSION } from '../../fsrs/params';
import type { Course } from '../../db/types';

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

const course = {
  id: 'course-1',
  name: 'Mathematics',
  createdAt: 0,
  updatedAt: 0,
  fsrsVersion: FSRS_VERSION,
  fsrsParameters: defaultFsrsParameters(),
  examObjective: 'expectedMarks',
} as Course;

describe('CourseAnalytics', () => {
  it('leaves the exam-day trend to the forecast card above rather than repeating it', () => {
    // Session history is passed as older callers did; the charts no longer read it.
    const props = { course, lessons: [], cards: [], reviewHistory: [], history: [] };
    render(<CourseAnalytics {...props} />);

    expect(screen.queryByText('Predicted exam-day score')).not.toBeInTheDocument();
    expect(screen.getByText('Review volume')).toBeInTheDocument();
  });
});
