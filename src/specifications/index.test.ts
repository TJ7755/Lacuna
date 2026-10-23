import { describe, expect, it } from 'vitest';
import { paperPoints, parseSpecification } from './catalogue';
import { findSpecification, specificationCatalogue } from './index';

const id = 'pearson-edexcel-international-gcse-4bi1';

describe('bundled specification catalogue', () => {
  it('validates every real entry and returns the indexed instance', () => {
    expect(specificationCatalogue.size).toBeGreaterThan(0);
    for (const [key, specification] of specificationCatalogue) {
      expect(parseSpecification(specification).ok).toBe(true);
      expect(findSpecification(key)).toBe(specification);
    }
    expect(findSpecification('unknown')).toBeUndefined();
  });

  it('retains all 176 Pearson statements and their permanent references', () => {
    const specification = findSpecification(id)!;
    const statements = specification.points.filter((point) => /^\d+\.\d+B?$/.test(point.ref));
    expect(
      [1, 2, 3, 4, 5].map(
        (topic) => statements.filter((point) => point.ref.startsWith(`${topic}.`)).length,
      ),
    ).toEqual([4, 95, 39, 18, 20]);
    for (const point of statements) {
      expect(point.id).toBe(point.ref.toLowerCase());
      expect(specification.points.some((parent) => parent.id === point.parentId)).toBe(true);
    }
  });

  it('excludes every B statement from Paper 1 and includes them on Paper 2', () => {
    const specification = findSpecification(id)!;
    const [first, second] = specification.papers;
    expect([first.durationMinutes, first.totalMarks]).toEqual([120, 110]);
    expect([second.durationMinutes, second.totalMarks]).toEqual([75, 70]);
    const core = paperPoints(specification, first, {});
    expect(core.map((point) => point.id)).toEqual(
      specification.points.filter((point) => !point.ref.endsWith('B')).map((point) => point.id),
    );
    expect(paperPoints(specification, second, {})).toEqual(specification.points);
    expect(core.some((point) => point.id === '2.14b')).toBe(false);
    expect(core.some((point) => point.id === '2.15')).toBe(true);
  });
});
