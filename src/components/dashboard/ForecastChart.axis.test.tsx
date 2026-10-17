import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('centres the exam label on its marker at phone width', () => {
    // A 322px plot, as on a 390px phone, where the exam sits within 48px of the right edge.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private callback: ResizeObserverCallback) {}
        observe() {
          this.callback([{ contentRect: { width: 322 } } as ResizeObserverEntry], this as never);
        }
        disconnect() {}
      },
    );
    try {
      renderChart(7);
      expect(screen.getByText('Exam')).toHaveAttribute('text-anchor', 'middle');
    } finally {
      vi.unstubAllGlobals();
    }
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

  it('spotlights the highest forecasts in stable descending order and keeps the rest quiet until asked', () => {
    const history = [0, 1, 2].map((k) => ({ at: NOW - (2 - k) * 9 * DAY, recall: 0.1 * k }));
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const recalls = [0.01, 0.02, 0.03, 0.04, 0.05, 0.8, 0.8, 0.9, 0.8];
    const { container } = render(
      <ForecastChart
        lines={names.map((name, i) => ({
          id: name,
          name,
          status: 'behind' as const,
          forecast: { ...forecast(7), ifStopped: recalls[i] },
          history: history.map((point) => ({ ...point, recall: recalls[i] })),
        }))}
        now={NOW}
        past={18}
        future={12}
        multiplier={0}
      />,
    );
    // Only the spotlit courses carry today's figure and a coloured line.
    const labels = [...container.querySelectorAll('text.font-display')];
    expect(labels.map((label) => label.textContent)).toEqual(['90%', '80%', '80%']);
    const colours = ['hsl(var(--accent-ink))', 'hsl(var(--series-1))', 'hsl(var(--series-2))'];
    labels.forEach((label, index) => {
      expect(label).toHaveAttribute('fill', colours[index]);
      expect(label.closest('g')!.querySelector('path')).toHaveAttribute('stroke', colours[index]);
    });
    const legend = screen.getByRole('list', { name: 'Courses' });
    const courseNames = () => [...legend.querySelectorAll('span[title]')].map((name) => name.textContent);
    expect(courseNames()).toEqual(['H', 'F', 'G']);
    const strokes = [...container.querySelectorAll('path')].map((path) => path.getAttribute('stroke'));
    expect(new Set(strokes).size).toBe(4);
    expect(screen.queryByRole('button', { name: 'D Behind' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '6 more' }));
    expect(courseNames()).toEqual(['H', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'I']);
    const d = screen.getByRole('button', { name: 'D Behind' });
    fireEvent.focus(d);
    expect(container.querySelectorAll('text.font-display')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Fewer' })).toHaveAttribute('aria-expanded', 'true');
  });
});
