import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionReport } from './SessionReport';
import type { SessionSummary } from './types';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['fast'],
  speedMultiplier: () => 1,
}));

vi.mock('../analytics/useChartColours', () => ({
  useChartColours: () => ({
    accent: 'hsl(220 90% 56%)',
    ink: 'hsl(220 20% 10%)',
    inkSoft: 'hsl(220 10% 50%)',
    inkFaint: 'hsl(220 10% 70%)',
    line: 'hsl(220 10% 90%)',
    positive: 'hsl(150 60% 45%)',
    surface: 'hsl(220 20% 98%)',
  }),
}));

vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

const mockSummary: SessionSummary = {
  events: [
    { grade: 3, correct: true, responseTimeSec: 2.5, distracted: false },
    { grade: 1, correct: false, responseTimeSec: 1.0, distracted: false },
    { grade: 4, correct: true, responseTimeSec: 1.8, distracted: false },
  ],
  masteryBefore: 0.4,
  masteryAfter: 0.55,
  objectiveLabel: 'Expected marks',
  focusFraction: 0.95,
  reachedGoal: true,
  limitReached: false,
  timeLimitReached: false,
};

describe('SessionReport', () => {
  it('renders the session report with correct title when goal reached', () => {
    const onReturn = vi.fn();
    render(<SessionReport summary={mockSummary} onReturn={onReturn} />);
    expect(screen.queryByText('Goal reached')).not.toBeInTheDocument();
    expect(screen.getByText('Goal reached.')).toBeInTheDocument();
  });

  it('reports progress changes in percentage points with a named progress bar', () => {
    render(<SessionReport summary={mockSummary} onReturn={vi.fn()} />);
    expect(screen.getByText('+15 percentage points')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Expected marks' })).toBeInTheDocument();
  });

  it('renders correct stat values', () => {
    render(<SessionReport summary={mockSummary} onReturn={vi.fn()} />);
    expect(screen.getByText('Cards reviewed')).toBeInTheDocument();
    expect(screen.getByText('Accuracy')).toBeInTheDocument();
    expect(screen.getByText('Mean time')).toBeInTheDocument();
    expect(screen.getByText('Focus')).toBeInTheDocument();
  });

  it('shows the progress bar section', () => {
    render(<SessionReport summary={mockSummary} onReturn={vi.fn()} />);
    expect(screen.getByText('Expected marks')).toBeInTheDocument();
    expect(screen.getByText('40% →')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
  });

  it('renders the grade distribution chart', () => {
    render(<SessionReport summary={mockSummary} onReturn={vi.fn()} />);
    expect(screen.getByText('How you rated')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('calls onReturn when Done is clicked', () => {
    const onReturn = vi.fn();
    render(<SessionReport summary={mockSummary} onReturn={onReturn} />);
    fireEvent.click(screen.getByText('Done'));
    expect(onReturn).toHaveBeenCalledOnce();
  });

  it('shows Continue button when limit is reached', () => {
    const limitSummary: SessionSummary = {
      ...mockSummary,
      reachedGoal: false,
      limitReached: true,
    };
    const onReturn = vi.fn();
    const onContinue = vi.fn();
    render(<SessionReport summary={limitSummary} onReturn={onReturn} onContinue={onContinue} />);
    expect(screen.getByText('You\u2019ve hit your daily limit')).toBeInTheDocument();
    expect(screen.getByText('Continue anyway')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Continue anyway'));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('shows distraction notice when there were distractions', () => {
    const distractedSummary: SessionSummary = {
      ...mockSummary,
      events: [
        ...mockSummary.events,
        { grade: 3, correct: true, responseTimeSec: 3.0, distracted: true },
      ],
    };
    render(<SessionReport summary={distractedSummary} onReturn={vi.fn()} />);
    expect(screen.getByText(/left the page during/)).toBeInTheDocument();
  });
});

describe('minimal completion report', () => {
  it('leads with the goal and keeps secondary results collapsed', () => {
    render(<SessionReport summary={mockSummary} onReturn={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Goal reached.' })).toBeVisible();
    expect(screen.queryByText('Session complete')).not.toBeInTheDocument();
    const details = screen.getByText('Session details').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toContainElement(screen.getByText('Mean time'));
    expect(details).toContainElement(screen.getByText('Focus'));
    expect(details).toContainElement(screen.getByText('+15 percentage points'));
    expect(screen.getByText('Accuracy').closest('details')).toBeNull();
  });

  it('retains simple-pass continuation without a grading chart', () => {
    const onContinue = vi.fn();
    render(
      <SessionReport
        summary={{ ...mockSummary, simpleMode: true }}
        onReturn={vi.fn()}
        onContinue={onContinue}
      />,
    );
    expect(screen.queryByText('How you rated')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep studying' }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});

it('keeps a time-limited session continuable without claiming the goal was reached', () => {
  const onContinue = vi.fn();
  render(
    <SessionReport
      summary={{ ...mockSummary, reachedGoal: false, timeLimitReached: true }}
      onReturn={vi.fn()}
      onContinue={onContinue}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Time’s up' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Goal reached.' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }));
  expect(onContinue).toHaveBeenCalledOnce();
});

it('reports an empty session and a negative progress change without invalid statistics', () => {
  render(
    <SessionReport
      summary={{ ...mockSummary, events: [], reachedGoal: false, masteryAfter: 0.3 }}
      onReturn={vi.fn()}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Nice work' })).toBeInTheDocument();
  expect(screen.getByText('0.0s')).toBeInTheDocument();
  expect(screen.getByText('-10 percentage points')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
  expect(screen.queryByRole('button', { name: 'Keep studying' })).not.toBeInTheDocument();
});
