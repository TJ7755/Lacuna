import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseGlyph, glyphDaysScale, glyphFill, glyphLoad } from './CourseGlyph';

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

  it('shrinks a day count of three or more digits to stay inside the ring', () => {
    expect(glyphDaysScale(9)).toBe(0.375);
    expect(glyphDaysScale(99)).toBe(0.375);
    // Measured in Bricolage Grotesque: three digits at 0.375 ran 27.7px into a 26.5px opening.
    expect(glyphDaysScale(150) * 1.846).toBeLessThanOrEqual(0.6);
    expect(glyphDaysScale(1200) * 2.46).toBeLessThanOrEqual(0.6);
    const far = render(<CourseGlyph days={150} recall={0.9} status="ahead" load={0} multiplier={0} />);
    expect((far.container.querySelector('.tabular-nums') as HTMLElement).style.fontSize).toBe('12.8px');
  });
});
