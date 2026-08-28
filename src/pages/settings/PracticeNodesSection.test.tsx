import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Lesson, PracticeNode } from '../../db/types';
import { PracticeNodesSection } from './PracticeNodesSection';

const navigate = vi.fn();
let lessons: Lesson[] | undefined;
let practiceNodes: PracticeNode[] | undefined;

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('../../state/useCourseData', () => ({
  useLessons: () => lessons,
  usePracticeNodes: () => practiceNodes,
}));

describe('PracticeNodesSection', () => {
  beforeEach(() => {
    navigate.mockClear();
    lessons = [];
    practiceNodes = [];
  });

  it('does not link to an empty path editor', () => {
    render(<PracticeNodesSection courseId="course-1" />);

    expect(screen.getByText('No manual practice nodes yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit on Path' })).not.toBeInTheDocument();
  });

  it('links existing manual nodes to their path editor', () => {
    practiceNodes = [
      {
        id: 'practice-1',
        courseId: 'course-1',
        type: 'manual',
        name: 'Practice',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    render(<PracticeNodesSection courseId="course-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit on Path' }));

    expect(navigate).toHaveBeenCalledWith('/course/course-1');
  });
});
