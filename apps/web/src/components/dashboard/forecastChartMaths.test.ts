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
  it('passes through a turning point without overshooting either neighbouring segment', () => {
    const path = smoothPath([
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 6, y: 0 },
    ]);
    const coordinates = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(coordinates.slice(0, 2)).toEqual([0, 0]);
    expect(coordinates.slice(6, 8)).toEqual([3, 3]);
    expect(coordinates.slice(-2)).toEqual([6, 0]);
    // Evaluate the SVG cubic at points along both segments, independently of its tangents.
    for (let segment = 0; segment < 2; segment++) {
      const startY = segment === 0 ? 0 : 3;
      const offset = 2 + segment * 6;
      const [, firstY, , secondY, , endY] = coordinates.slice(offset, offset + 6);
      for (let sample = 0; sample <= 100; sample++) {
        const t = sample / 100;
        const y =
          (1 - t) ** 3 * startY +
          3 * (1 - t) ** 2 * t * firstY +
          3 * (1 - t) * t ** 2 * secondY +
          t ** 3 * endY;
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(3);
      }
    }
  });
});
