import { describe, expect, it } from 'vitest';
import { glyphFill, glyphLoad } from './CourseGlyph';

describe('CourseGlyph', () => {
  it('maps recall onto the ring from 50% (empty) to 100% (full)', () => {
    expect(glyphFill(0.4)).toBe(0);
    expect(glyphFill(0.75)).toBeCloseTo(0.5);
    expect(glyphFill(1)).toBe(1);
  });

  it('lights up to four load dots from the minutes due today', () => {
    expect([0, 2, 6, 12, 30].map(glyphLoad)).toEqual([0, 1, 2, 3, 4]);
  });
});
