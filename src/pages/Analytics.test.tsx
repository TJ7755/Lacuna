import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Analytics } from './Analytics';

const live = vi.hoisted(() => ({
  history: [] as {
    timestamp: number;
    deckId: string;
    courseId: string;
    averagePredictedRetrievability: number;
  }[],
  courses: [] as { id: string; name: string; archived?: boolean }[],
}));

vi.mock('../state/useData', () => ({
  useAllCards: () => [],
  useAllReviewHistory: () => [],
  useAllSessionHistory: () => live.history,
}));

vi.mock('../state/useCourseData', () => ({ useCourses: () => live.courses }));

vi.mock('../components/analytics/useChartColours', () => ({
  useChartColours: () => ({
    accent: '#000',
    ink: '#000',
    inkFaint: '#000',
    line: '#000',
    positive: '#000',
    surface: '#fff',
  }),
}));

vi.mock('../components/analytics/ChartCard', () => ({
  ChartFrame: () => null,
  ChartCard: ({
    title,
    description,
    emptyMessage,
    data,
  }: {
    title: string;
    description?: string;
    emptyMessage?: string;
    data?: { rows: unknown[] };
  }) => (
    <section aria-label={title} data-rows={data?.rows.length}>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {emptyMessage && <p>{emptyMessage}</p>}
    </section>
  ),
}));

vi.mock('../components/analytics/CourseComparison', () => ({
  CourseComparison: () => <section>Course comparison</section>,
}));

vi.mock('recharts', () => ({
  Area: () => null,
  AreaChart: ({ children }: { children?: React.ReactNode }) => children,
  Bar: ({ children }: { children?: React.ReactNode }) => children,
  BarChart: ({ children }: { children?: React.ReactNode }) => children,
  CartesianGrid: () => null,
  Cell: () => null,
  Line: () => null,
  LineChart: ({ children }: { children?: React.ReactNode }) => children,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => children,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe('Analytics', () => {
  it('limits the exam-day score trajectory to the selected period', () => {
    const DAY = 86_400_000;
    live.courses = [{ id: 'c', name: 'Course' }];
    live.history = Array.from({ length: 60 }, (_, index) => ({
      timestamp: Date.now() - index * DAY,
      deckId: 'd',
      courseId: 'c',
      averagePredictedRetrievability: 0.8,
    }));
    try {
      render(<Analytics />);
      const chart = screen.getByRole('region', { name: 'Predicted exam-day score' });
      expect(chart).toHaveAttribute('data-rows', '30');
      // A grid cell that may not shrink lets a chart's first measurement overflow a phone.
      expect(chart.parentElement).toHaveClass('min-w-0');
      fireEvent.click(screen.getByRole('button', { name: '7 days' }));
      expect(chart).toHaveAttribute('data-rows', '7');
    } finally {
      live.courses = [];
      live.history = [];
    }
  });

  it('uses chart titles without redundant explanatory subtitles', () => {
    render(<Analytics />);

    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.queryByText('Insights across every course.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Cards due and new cards scheduled per day for the next 30 days.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Reviews completed each day over the past 30 days.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Minutes spent studying each day over the past 30 days.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Brier score · lower is better')).toBeInTheDocument();
  });

  it('keeps empty states concise', () => {
    render(<Analytics />);

    expect(screen.getByText('No leech cards.')).toBeInTheDocument();
    expect(screen.queryByText(/great job/i)).not.toBeInTheDocument();
  });

  it('leads with the headline figures and a period switch that defaults to 30 days', () => {
    render(<Analytics />);

    const summary = screen.getByRole('region', { name: 'Summary' });
    for (const label of ['Reviews', 'Study time', 'Recall', 'Cards']) {
      expect(summary).toHaveTextContent(label);
    }
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('gridcell')).toHaveLength(30);
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getAllByRole('gridcell')).toHaveLength(7);
    expect(screen.getByText('0 reviews in 7 days')).toBeInTheDocument();
  });

  it('keeps the review heatmap on this page', () => {
    render(<Analytics />);

    expect(screen.getByRole('heading', { name: 'When you studied' })).toBeInTheDocument();
    expect(
      screen.getByRole('grid', { name: 'Review activity over the last 30 days' }),
    ).toBeInTheDocument();
  });
});
