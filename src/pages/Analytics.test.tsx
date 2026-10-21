import { expectAppDestination } from '../../tests/helpers/expectAppDestination';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  cards: [] as Record<string, unknown>[],
}));

vi.mock('../state/useData', () => ({
  useAllCards: () => live.cards,
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
    empty,
    action,
  }: {
    title: string;
    description?: string;
    emptyMessage?: string;
    data?: { rows: unknown[] };
    empty?: boolean;
    action?: React.ReactNode;
  }) => (
    <section aria-label={title} data-rows={data?.rows.length}>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {emptyMessage && <p>{emptyMessage}</p>}
      {!empty && action}
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

  it('shows a single day of predictions and explains how the trajectory averages courses', () => {
    live.courses = [{ id: 'c', name: 'Course' }];
    live.history = [
      { timestamp: Date.now(), deckId: 'd', courseId: 'c', averagePredictedRetrievability: 0.73 },
    ];
    try {
      render(<Analytics />);
      const chart = screen.getByRole('region', { name: 'Predicted exam-day score' });
      expect(chart).toHaveTextContent(
        /Predicted 73% on .+\. Study on another day to see a trend\./,
      );
      expect(chart).toHaveTextContent(
        'Each point is a day you studied, averaging the courses studied that day.',
      );
    } finally {
      live.courses = [];
      live.history = [];
    }
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

  it('explains stability and leeches and links leeches to the affected cards', () => {
    live.courses = [{ id: 'c', name: 'Biology' }];
    live.cards = [
      { id: 'leech', courseId: 'c', lapses: 8, stability: 2, history: [] },
      { id: 'steady', courseId: 'c', lapses: 0, stability: 40, history: [] },
    ];
    try {
      render(<Analytics />, { wrapper: MemoryRouter });
      const stability = screen.getByRole('region', { name: 'Stability profile' });
      expect(stability).toHaveTextContent("Days until each card's recall is likely to fall to 90%");
      const leeches = screen.getByRole('region', { name: 'Leech count by course' });
      expect(leeches).toHaveTextContent('Cards you keep forgetting.');
      expectAppDestination(
        within(leeches).getByRole('link', { name: 'Show leech cards' }),
        '/search?filter=leech',
      );
    } finally {
      live.courses = [];
      live.cards = [];
    }
  });
});
