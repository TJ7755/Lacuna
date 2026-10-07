import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ForecastChart } from './ForecastChart';
import type { CourseForecast } from '../../fsrs/courseForecast';

const DAY = 86_400_000;

function forecast(now: number, days: number): CourseForecast {
  const end = now + days * DAY;
  const outlook = [0, 1, 2].map((k) => ({
    at: now + (k * (end - now)) / 2,
    recall: 0.6 + k * 0.1,
  }));
  return {
    start: now,
    end,
    hasExam: true,
    target: 0.9,
    current: 0.6,
    ifStopped: 0.6,
    atEnd: 0.8,
    series: outlook,
    outlook,
  };
}

describe('ForecastChart axis', () => {
  it('ends the time axis at the exam, so a near exam fills the width', () => {
    const now = Date.UTC(2026, 9, 7);
    const { container } = render(
      <ForecastChart
        lines={[{ id: 'c', name: 'Course', status: 'ahead', forecast: forecast(now, 7) }]}
        now={now}
        multiplier={0}
      />,
    );
    const svg = container.querySelector('svg')!;
    const width = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const examDot = container.querySelector('circle')!;
    // The plot's right edge sits 16px inside the chart.
    expect(Number(examDot.getAttribute('cx'))).toBeCloseTo(width - 16);
  });
});
