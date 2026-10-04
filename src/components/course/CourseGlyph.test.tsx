import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseGlyph, glyphFill, glyphLoad } from './CourseGlyph';

describe('CourseGlyph', () => {
  it('maps recall onto the ring from 50% (empty) to 100% (full)', () => {
    expect(glyphFill(0.4)).toBe(0);
    expect(glyphFill(0.75)).toBeCloseTo(0.5);
    expect(glyphFill(1)).toBe(1);
  });

  it('lights up to four load dots from the minutes due today', () => {
    expect([0, 2, 6, 12, 30].map(glyphLoad)).toEqual([0, 1, 2, 3, 4]);
  });

  it('shows the days to the exam, or an infinity sign without one', () => {
    const dated = render(<CourseGlyph days={22} recall={0.91} status="ahead" load={3} multiplier={0} />);
    expect(dated.container.textContent).toBe('22');
    const steady = render(<CourseGlyph days={null} recall={0.9} status="steady" load={1} multiplier={0} />);
    expect(steady.container.textContent).toBe('');
    expect(steady.container.querySelectorAll('path')).toHaveLength(3);
  });
});
