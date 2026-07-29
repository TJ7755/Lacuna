import { describe, expect, it } from 'vitest';
import { groupStrokes } from './group';
import type { Point } from './strokes';

/** Sample a straight line into points belonging to stroke `strokeId`. */
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeId: number,
  count = 8,
): Point[] =>
  Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), strokeId };
  });

describe('groupStrokes', () => {
  it('merges the two bars of `=` into one symbol', () => {
    const groups = groupStrokes([...line(0, 20, 40, 20, 0), ...line(0, 40, 40, 40, 1)]);
    expect(groups.length).toBe(1);
    expect(groups[0].strokes).toBe(2);
  });

  it('merges the crossing strokes of `x`', () => {
    const groups = groupStrokes([...line(0, 0, 40, 40, 0), ...line(40, 0, 0, 40, 1)]);
    expect(groups.length).toBe(1);
  });

  it('merges `+`, whose vertical stroke overlaps the bar by almost nothing', () => {
    // The failure a pure ratio-of-overlap rule produces: the vertical stroke has zero
    // width, so there is no ratio to take, and only containment can save it.
    const groups = groupStrokes([...line(20, 0, 20, 40, 0), ...line(0, 20, 40, 20, 1)]);
    expect(groups.length).toBe(1);
    expect(groups[0].strokes).toBe(2);
  });

  it('keeps side-by-side digits apart', () => {
    const groups = groupStrokes([...line(0, 0, 10, 40, 0), ...line(30, 0, 40, 40, 1)]);
    expect(groups.length).toBe(2);
  });

  it('keeps a decimal point separate from the digits either side', () => {
    const groups = groupStrokes([
      ...line(0, 0, 15, 40, 0),
      // A tap: one point, zero width and zero height.
      [{ x: 25, y: 38, strokeId: 1 }],
      ...line(35, 0, 50, 40, 2),
    ].flat());
    expect(groups.length).toBe(3);
  });

  it('orders groups left to right regardless of the order they were drawn', () => {
    // A writer who finishes `4 + ` and then goes back to insert something earlier still
    // gets groups in reading order.
    const groups = groupStrokes([...line(60, 0, 70, 40, 0), ...line(0, 0, 10, 40, 1)]);
    expect(groups.length).toBe(2);
    expect(groups[0].box.minX).toBeLessThan(groups[1].box.minX);
  });

  it('does not merge a superscript with the symbol it sits above', () => {
    // `x^2`: the exponent is up and to the right, sharing no horizontal span.
    const groups = groupStrokes([
      ...line(0, 20, 30, 50, 0),
      ...line(30, 20, 0, 50, 1),
      ...line(40, 0, 55, 20, 2),
    ]);
    expect(groups.length).toBe(2);
  });

  it('returns nothing for an empty gesture', () => {
    expect(groupStrokes([])).toEqual([]);
  });

  it('treats a single stroke as a single symbol', () => {
    const groups = groupStrokes(line(0, 0, 10, 40, 0));
    expect(groups.length).toBe(1);
    expect(groups[0].strokes).toBe(1);
  });

  it('respects a raised overlap threshold', () => {
    // Two strokes overlapping by a third of their width: merged by default, split when
    // the threshold demands more.
    const strokes = [...line(0, 0, 30, 40, 0), ...line(20, 0, 50, 40, 1)];
    expect(groupStrokes(strokes, { overlapThreshold: 0.2 }).length).toBe(1);
    expect(groupStrokes(strokes, { overlapThreshold: 0.9 }).length).toBe(2);
  });
});
