import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CourseAssessment } from '../../db/types';
import { UpcomingAssessmentsStrip } from './UpcomingAssessmentsStrip';

const now = 2_000_000_000_000;

function makeAssessment(
  overrides: Partial<Omit<CourseAssessment, 'coverageMode' | 'lessonIds'>>,
): CourseAssessment {
  return {
    id: 'a1',
    courseId: 'c1',
    name: 'Paper 1',
    kind: 'checkpoint',
    examDate: now + 1,
    afterLessonId: 'l1',
    coverageMode: 'prefix',
    excludedCardIds: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('UpcomingAssessmentsStrip', () => {
  it('renders upcoming assessments with date and name, nearest first', () => {
    const soon = makeAssessment({ id: 'soon', name: 'Mock exam', examDate: now + 5 * 86_400_000 });
    const later = makeAssessment({ id: 'later', name: 'Final', kind: 'final', examDate: now + 20 * 86_400_000 });
    render(
      <UpcomingAssessmentsStrip
        assessments={[later, soon]}
        now={now}
        onSelect={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('Mock exam');
    expect(buttons[1]).toHaveTextContent('Final');
  });

  it('omits past assessments', () => {
    const past = makeAssessment({ id: 'past', name: 'Old checkpoint', examDate: now - 1 });
    const upcoming = makeAssessment({ id: 'upcoming', name: 'Next checkpoint', examDate: now + 1 });
    render(
      <UpcomingAssessmentsStrip
        assessments={[past, upcoming]}
        now={now}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText('Old checkpoint')).not.toBeInTheDocument();
    expect(screen.getByText('Next checkpoint')).toBeInTheDocument();
  });

  it('calls onSelect with the assessment id when clicked', () => {
    const onSelect = vi.fn();
    const upcoming = makeAssessment({ id: 'upcoming', name: 'Next checkpoint', examDate: now + 1 });
    render(<UpcomingAssessmentsStrip assessments={[upcoming]} now={now} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Next checkpoint/ }));
    expect(onSelect).toHaveBeenCalledWith('upcoming');
  });

  it('provides the shared feedback tier for hover and press states', () => {
    const upcoming = makeAssessment({ id: 'upcoming', name: 'Next checkpoint', examDate: now + 1 });
    render(<UpcomingAssessmentsStrip assessments={[upcoming]} now={now} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Next checkpoint/ })).toHaveClass(
      'transition-[border-color,background-color,color,transform]',
      'motion-reduce:transition-none',
    );
    expect(screen.getByRole('button', { name: /Next checkpoint/ })).toHaveAttribute(
      'data-motion-transition-tier',
      'feedback',
    );
  });

  it('renders nothing when there are no upcoming assessments', () => {
    const past = makeAssessment({ id: 'past', name: 'Old checkpoint', examDate: now - 1 });
    const { container } = render(
      <UpcomingAssessmentsStrip assessments={[past]} now={now} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
