import { describe, expect, it } from 'vitest';
import { courseColours } from './colour';

const ids = ['biology', 'history', 'physics', 'chemistry', '生物学', 'c'.repeat(200)];

describe('courseColours', () => {
  it.each([1, 2, 3, 4, 5, 6])(
    'assigns %i courses distinct palette slots regardless of input order',
    (count) => {
      const courses = ids.slice(0, count);
      const colours = courseColours(courses);
      expect(new Set(colours.values()).size).toBe(count);
      expect(courseColours([...courses].reverse())).toEqual(colours);
      expect(courseColours([...courses.slice(1), courses[0]])).toEqual(colours);
      expect(courses).toEqual(ids.slice(0, count));
    },
  );

  it('uses the existing palette in ID order and cycles only beyond six courses', () => {
    const colours = courseColours(['g', 'f', 'e', 'd', 'c', 'b', 'a', 'a']);
    expect([...colours]).toEqual([
      ['a', 'hsl(var(--accent-ink))'],
      ['b', 'hsl(var(--series-1))'],
      ['c', 'hsl(var(--series-2))'],
      ['d', 'hsl(var(--series-3))'],
      ['e', 'hsl(var(--series-4))'],
      ['f', 'hsl(var(--series-5))'],
      ['g', 'hsl(var(--accent-ink))'],
    ]);
    expect(courseColours([]).size).toBe(0);
  });
});
