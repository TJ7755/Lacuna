import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ForecastChart } from './ForecastChart';
import type { CourseForecast } from '../../fsrs/courseForecast';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 8);

function forecast(days: number): CourseForecast {
  return { end: NOW + days * DAY, hasExam: true, target: 0.9, ifStopped: 0.62 };
}

function renderChart(days: number) {
  const history = [0, 1, 2].map((k) => ({ at: NOW - (2 - k) * 9 * DAY, recall: 0.4 + k * 0.11 }));
  return render(
    <ForecastChart
      lines={[{ id: 'c', name: 'Course', status: 'behind', forecast: forecast(days), history }]}
      now={NOW}
      past={18}
      future={12}
      multiplier={0}
    />,
  );
}

describe('ForecastChart axis', () => {
  it('places today 60% across the plot and labels its stop-now figure once', () => {
    const { container } = renderChart(7);
    const width = Number(container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2]);
    const dot = container.querySelector('circle')!;
    // The plot runs from 40px in to 16px short of the right edge.
    expect(Number(dot.getAttribute('cx'))).toBeCloseTo(40 + 0.6 * (width - 56));
    expect(screen.getAllByText('62%')).toHaveLength(1);
    expect(screen.getByText(/· Exam/)).toBeInTheDocument();
  });

  it('points to an exam beyond the window from the axis edge', () => {
    renderChart(40);
    expect(screen.queryByText(/· Exam/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Exam .+ →$/)).toBeInTheDocument();
  });

  it('colours each course apart and states its status in the legend', () => {
    const history = [0, 1, 2].map((k) => ({ at: NOW - (2 - k) * 9 * DAY, recall: 0.7 + k * 0.1 }));
    const ahead = { ...forecast(7), ifStopped: 0.95 };
    const { container } = render(
      <ForecastChart
        lines={[
          { id: 'a', name: 'Biology', status: 'ahead', forecast: ahead, history },
          { id: 'b', name: 'Chemistry', status: 'ahead', forecast: ahead, history },
          { id: 'c', name: 'Physics', status: 'behind', forecast: forecast(7), history },
        ]}
        now={NOW}
        past={18}
        future={12}
        multiplier={0}
      />,
    );
    const strokes = [...container.querySelectorAll('path')].map((path) => path.getAttribute('stroke'));
    expect(new Set(strokes).size).toBe(3);
    expect(screen.getByRole('button', { name: 'Biology On track' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Physics Behind' })).toBeInTheDocument();
  });

  it('spotlights the first three of many courses and keeps the rest quiet until asked', () => {
    const history = [0, 1, 2].map((k) => ({ at: NOW - (2 - k) * 9 * DAY, recall: 0.1 * k }));
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const { container } = render(
      <ForecastChart
        lines={names.map((name, i) => ({
          id: name,
          name,
          status: 'behind' as const,
          forecast: { ...forecast(7), ifStopped: i / 100 },
          history,
        }))}
        now={NOW}
        past={18}
        future={12}
        multiplier={0}
      />,
    );
    // Only the spotlit courses carry today's figure and a coloured line.
    expect(container.querySelectorAll('text.font-display')).toHaveLength(3);
    const strokes = [...container.querySelectorAll('path')].map((path) => path.getAttribute('stroke'));
    expect(new Set(strokes).size).toBe(4);
    expect(screen.queryByRole('button', { name: 'D Behind' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '6 more' }));
    const d = screen.getByRole('button', { name: 'D Behind' });
    fireEvent.focus(d);
    expect(container.querySelectorAll('text.font-display')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Fewer' })).toHaveAttribute('aria-expanded', 'true');
  });
});
