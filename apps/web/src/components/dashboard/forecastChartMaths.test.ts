import { describe, expect, it } from 'vitest';
import { smoothPath } from './forecastChartMaths';

describe('forecast curve path', () => {
  it('supports empty, single-point and straight two-point histories', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 0, y: 10 }])).toBe('M0.0 10.0');
    expect(
      smoothPath([
        { x: 0, y: 10 },
        { x: 20, y: 30 },
      ]),
    ).toBe('M0.0 10.0 L20.0 30.0');
  });
  it('flattens the tangent at a turning point to avoid overshoot', () => {
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 3, y: 3 },
        { x: 6, y: 0 },
      ]),
    ).toBe('M0.0 0.0 C1.0 1.0, 2.0 3.0, 3.0 3.0 C4.0 3.0, 5.0 1.0, 6.0 0.0');
  });
});
