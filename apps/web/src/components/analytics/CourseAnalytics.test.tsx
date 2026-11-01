import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Course } from '@lacuna/core/db/types';
import { writeAdvancedDetails } from '../../state/advancedDetails';
import { CourseAnalytics } from './CourseAnalytics';

vi.mock('./useChartColours', () => ({
  useChartColours: () => ({ accent: '#000', positive: '#000' }),
}));

afterEach(() => localStorage.removeItem('lacuna.advancedDetails'));

it('keeps course study evidence and restores stability only when advanced details are enabled', () => {
  writeAdvancedDetails(false);
  render(
    <CourseAnalytics
      course={{ id: 'course', name: 'Biology' } as Course}
      lessons={[]}
      cards={[]}
      reviewHistory={[]}
    />,
  );

  expect(screen.queryByRole('heading', { name: 'Card stability profile' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Lesson breakdown' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Review volume' })).toBeInTheDocument();

  act(() => writeAdvancedDetails(true));
  expect(screen.getByRole('heading', { name: 'Card stability profile' })).toBeInTheDocument();
});
