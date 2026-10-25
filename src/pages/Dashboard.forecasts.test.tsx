import {
  dashboardState,
  mockCourse,
  course,
  summary,
  forecast,
  setCourseData,
} from './Dashboard.testSupport';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { Dashboard } from './Dashboard';

describe('Dashboard forecasts', () => {
  it('shows the exam-day forecast with a legend entry per course', async () => {
    setCourseData([mockCourse, course('course-2', 'Second Course')], {
      summaries: { 'course-1': summary(3), 'course-2': summary(1) },
    });
    dashboardState.mockForecasts = { 'course-1': forecast(0.93), 'course-2': forecast(0.71) };
    render(<Dashboard />);

    // The chart loads on demand.
    expect(await screen.findByRole('heading', { name: 'Exam-day forecast' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Exam-day forecast' })).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Courses' });
    expect(
      within(legend).getByRole('button', { name: 'Test Course On track' }),
    ).toBeInTheDocument();
    expect(
      within(legend).getByRole('button', { name: 'Second Course Behind' }),
    ).toBeInTheDocument();
    // Each course's figure appears once, beside its point at today.
    expect(screen.getAllByText('93%')).toHaveLength(1);
    expect(screen.getAllByText('71%')).toHaveLength(1);
  });

  it('omits the forecast chart when no course has a forecast to draw', () => {
    setCourseData();
    render(<Dashboard />);
    expect(screen.queryByRole('heading', { name: 'Exam-day forecast' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test Course' })).toBeInTheDocument();
  });

  it('labels the rolling review count separately from calendar-week study days', async () => {
    setCourseData([mockCourse], {
      streak: 5,
      reviewActivity: new Map([['card-1', [Date.now(), Date.now() - 1000]]]),
    });
    dashboardState.mockForecasts = { 'course-1': forecast(0.9) };
    render(<Dashboard />);

    expect(await screen.findByText('days in a row')).toBeInTheDocument();
    expect(screen.getByText('cards in the last 7 days')).toBeInTheDocument();
    expect(screen.getByText('studied this week')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Studied on \d of \d days this week/)).toBeInTheDocument();
    const streak = screen.getByText('days in a row').parentElement as HTMLElement;
    expect(streak).toHaveTextContent('5');
    const cards = screen.getByText('cards in the last 7 days').parentElement as HTMLElement;
    expect(cards).toHaveTextContent('2');
  });

  it('leads with the forecast, above what to study', async () => {
    setCourseData([mockCourse], {
      summaries: { 'course-1': summary(3) },
      reviewActivity: new Map([['card-1', [Date.now()]]]),
    });
    dashboardState.mockForecasts = { 'course-1': forecast(0.9) };
    render(<Dashboard />);

    const queue = await screen.findByRole('region', { name: 'Today, most urgent first' });
    const forecastPanel = screen.getByRole('region', { name: 'Forecast and this week' });
    expect(forecastPanel.compareDocumentPosition(queue)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByLabelText('Today: 3 cards, about 1 minute')).toHaveTextContent('3cards');
  });

  it('holds the queue until the forecast can arrive whole above it', async () => {
    setCourseData([mockCourse], { summaries: { 'course-1': summary(3) } });
    dashboardState.mockForecasts = { 'course-1': forecast(0.9) };
    dashboardState.mockReviewHistory = undefined;
    const { rerender } = render(<Dashboard />);

    // Review history is still loading, so neither the forecast nor the queue shows yet.
    expect(
      screen.queryByRole('region', { name: 'Today, most urgent first' }),
    ).not.toBeInTheDocument();

    dashboardState.mockReviewHistory = [];
    rerender(<Dashboard />);
    const queue = await screen.findByRole('region', { name: 'Today, most urgent first' });
    const forecastPanel = screen.getByRole('region', { name: 'Forecast and this week' });
    expect(
      within(forecastPanel).getByRole('heading', { name: 'Exam-day forecast' }),
    ).toBeInTheDocument();
    expect(forecastPanel.compareDocumentPosition(queue)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows the queue without waiting indefinitely on a slow forecast', () => {
    vi.useFakeTimers();
    try {
      setCourseData([mockCourse], { summaries: { 'course-1': summary(3) } });
      dashboardState.mockForecasts = { 'course-1': forecast(0.9) };
      dashboardState.mockReviewHistory = undefined;
      render(<Dashboard />);
      expect(screen.queryByRole('button', { name: 'Test Course' })).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(200);
      });
      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(screen.getByRole('button', { name: 'Test Course' })).toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Forecast and this week' }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
