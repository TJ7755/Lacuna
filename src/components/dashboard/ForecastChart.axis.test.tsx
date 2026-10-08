import { render, screen } from '@testing-library/react';
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
});
