import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Analytics } from './Analytics';

vi.mock('../state/useData', () => ({
  useAllCards: () => [],
  useAllReviewHistory: () => [],
  useAllSessionHistory: () => [],
}));

vi.mock('../state/useCourseData', () => ({ useCourses: () => [] }));

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
  ChartCard: ({
    title,
    description,
    emptyMessage,
  }: {
    title: string;
    description?: string;
    emptyMessage?: string;
  }) => (
    <section>
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
  it('uses chart titles without redundant explanatory subtitles', () => {
    render(<Analytics />);

    const header = screen.getByRole('heading', { name: 'Analytics' }).closest('header');
    expect(header).not.toHaveClass('rounded-2xl', 'border', 'bg-surface');
    expect(screen.queryByText('Insights across every course.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Cards due and new cards scheduled per day for the next 30 days.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Reviews completed each day over the past 30 days.')).not.toBeInTheDocument();
    expect(screen.queryByText('Minutes spent studying each day over the past 30 days.')).not.toBeInTheDocument();
    expect(screen.getByText('Brier score · lower is better')).toBeInTheDocument();
  });

  it('keeps empty states concise', () => {
    render(<Analytics />);

    expect(screen.getByText('No leech cards.')).toBeInTheDocument();
    expect(screen.queryByText(/great job/i)).not.toBeInTheDocument();
  });
});
