import { describe, expect, it } from 'vitest';
import { greedyCloudMatch, makeTemplate, recognise } from './dollarP';
import { normalise, resample, RESAMPLE_POINTS, splitStrokes, type Point } from './strokes';

/** Sample a straight line into `count` points belonging to stroke `strokeId`. */
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeId: number,
  count = 12,
): Point[] =>
  Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), strokeId };
  });

/** Two horizontal bars. The canonical multi-stroke case $1 cannot express. */
const equals = (): Point[] => [...line(0, 0, 100, 0, 0), ...line(0, 40, 100, 40, 1)];

/** Two crossing diagonals. */
const ex = (): Point[] => [...line(0, 0, 100, 100, 0), ...line(100, 0, 0, 100, 1)];

const plus = (): Point[] => [...line(50, 0, 50, 100, 0), ...line(0, 50, 100, 50, 1)];

const transform = (points: Point[], scale: number, dx: number, dy: number): Point[] =>
  points.map((p) => ({ ...p, x: p.x * scale + dx, y: p.y * scale + dy }));

describe('resample', () => {
  it('produces exactly the requested number of points for a single stroke', () => {
    expect(resample(line(0, 0, 100, 0, 0)).length).toBe(RESAMPLE_POINTS);
  });

  it('produces exactly the requested number of points across multiple strokes', () => {
    expect(resample(equals()).length).toBe(RESAMPLE_POINTS);
    expect(resample(ex(), 64).length).toBe(64);
  });

  it('keeps points within their original stroke', () => {
    // The deliberate deviation from the reference implementation: no point is invented
    // on the invisible jump between strokes.
    const strokes = splitStrokes(resample(equals()));
    expect(strokes.length).toBe(2);
    expect(strokes.every((stroke) => stroke.length >= 2)).toBe(true);
  });

  it('handles a single-point stroke without dividing by zero', () => {
    const dot: Point[] = [{ x: 5, y: 5, strokeId: 0 }];
    expect(resample(dot).length).toBe(RESAMPLE_POINTS);
    expect(resample(dot).every((p) => Number.isFinite(p.x))).toBe(true);
  });
});

describe('normalise', () => {
  it('centres the cloud on the origin', () => {
    const points = normalise(equals());
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    expect(cx).toBeCloseTo(0, 10);
    expect(cy).toBeCloseTo(0, 10);
  });

  it('is invariant to translation and uniform scale', () => {
    const a = normalise(ex());
    const b = normalise(transform(ex(), 3.7, -240, 18));
    expect(greedyCloudMatch(a, b)).toBeLessThan(0.01);
  });

  it('preserves aspect ratio, so a bar and a tall line stay distinguishable', () => {
    const bar = normalise(line(0, 0, 100, 0, 0));
    const tall = normalise(line(0, 0, 0, 100, 0));
    // Non-uniform scaling would collapse these onto each other.
    expect(greedyCloudMatch(bar, tall)).toBeGreaterThan(0.1);
  });
});

describe('recognise', () => {
  const templates = [
    makeTemplate('=', equals(), 'user'),
    makeTemplate('x', ex(), 'user'),
    makeTemplate('+', plus(), 'user'),
  ];

  it('matches a gesture to its own template', () => {
    expect(recognise(equals(), templates)[0].label).toBe('=');
    expect(recognise(ex(), templates)[0].label).toBe('x');
    expect(recognise(plus(), templates)[0].label).toBe('+');
  });

  it('matches despite translation and scale', () => {
    const drawn = transform(plus(), 0.4, 500, -60);
    expect(recognise(drawn, templates)[0].label).toBe('+');
  });

  it('is invariant to stroke order', () => {
    // The property that makes $P worth the extra complexity over $1: a child who draws
    // the lower bar of `=` first must not need a second template.
    const reversed = [...line(0, 40, 100, 40, 0), ...line(0, 0, 100, 0, 1)];
    expect(recognise(reversed, templates)[0].label).toBe('=');
  });

  it('separates `+` from `x`, which differ only by rotation', () => {
    // $P is deliberately not rotation-invariant. If this ever fails, the recogniser has
    // become useless for maths regardless of its headline accuracy.
    const ranked = recognise(plus(), templates);
    expect(ranked[0].label).toBe('+');
    expect(ranked[0].distance).toBeLessThan(ranked[1].distance);
  });

  it('returns every candidate ranked, for confusion analysis', () => {
    const ranked = recognise(ex(), templates);
    expect(ranked.map((m) => m.label).sort()).toEqual(['+', '=', 'x']);
    expect(ranked[0].distance).toBeLessThanOrEqual(ranked[1].distance);
    expect(ranked[1].distance).toBeLessThanOrEqual(ranked[2].distance);
  });

  it('scores an exact match near 1 and clamps to [0, 1]', () => {
    const [best] = recognise(equals(), templates);
    expect(best.score).toBeGreaterThan(0.95);
    expect(best.score).toBeLessThanOrEqual(1);
    expect(recognise(ex(), templates).every((m) => m.score >= 0)).toBe(true);
  });

  it('returns nothing when there are no templates or no points', () => {
    expect(recognise(ex(), [])).toEqual([]);
    expect(recognise([], templates)).toEqual([]);
  });
});
