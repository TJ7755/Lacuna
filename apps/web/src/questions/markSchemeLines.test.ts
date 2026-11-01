import { describe, expect, it } from 'vitest';
import { parseMarkSchemeLines, formatMarkSchemeLines } from './markSchemeLines';

describe('mark scheme lines', () => {
  it('round-trips weighted points and keeps their identities and annotations', () => {
    const previous = [
      {
        id: 'point',
        criterion: 'Old wording',
        maxMarks: 2,
        dimension: 'application' as const,
        explanation: 'Accept equivalents.',
        targetConceptIds: ['concept'],
      },
    ];
    const points = parseMarkSchemeLines('New wording (2)\n\nA second point', previous);
    expect(points[0]).toEqual({ ...previous[0], criterion: 'New wording' });
    expect(points[1]).toMatchObject({
      criterion: 'A second point',
      maxMarks: 1,
      dimension: 'knowledge',
      targetConceptIds: [],
    });
    expect(formatMarkSchemeLines(points)).toBe('New wording (2)\nA second point');
    expect(parseMarkSchemeLines(formatMarkSchemeLines(points), points)).toEqual(points);
  });
  it('preserves a literal numeric suffix by displaying an explicit weight', () => {
    const point = {
      id: 'literal',
      criterion: 'See equation (2)',
      maxMarks: 1,
      dimension: 'knowledge' as const,
      targetConceptIds: [],
    };
    expect(formatMarkSchemeLines([point])).toBe('See equation (2) (1)');
    expect(parseMarkSchemeLines(formatMarkSchemeLines([point]), [point])).toEqual([point]);
  });
});
