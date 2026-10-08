import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CourseStudyActions } from './CourseStudyActions';

describe('CourseStudyActions', () => {
  it('shows what is due in a ring beside Study rather than inside the button', () => {
    render(<CourseStudyActions dueCount={12} doneToday={8} onStudy={vi.fn()} otherWays={[]} />);

    expect(screen.getByRole('button', { name: 'Study' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '12 cards due today' })).toHaveTextContent('12');
  });

  it('completes the ring with a tick once nothing is due', () => {
    render(<CourseStudyActions dueCount={0} doneToday={5} onStudy={vi.fn()} otherWays={[]} />);

    expect(screen.getByRole('img', { name: 'Nothing due today' })).toBeInTheDocument();
  });
});
