import { describe, expect, it } from 'vitest';
import { jevPartialGrade } from './useTypedAutoMark';

describe('Jev partial recall', () => {
  it('requires strictly more than half, with no unknown parts', () => {
    for (let total = 0; total <= 12; total++) {
      for (let covered = 0; covered <= total; covered++) {
        expect(jevPartialGrade({ kind: 'imprecise', parts: [] })).toBe(2);
        const parts = Array.from({ length: total }, (_, i) => ({
          start: i,
          end: i + 1,
          covered: i < covered,
        }));
        for (const kind of ['partial'] as const) {
          expect(jevPartialGrade({ kind, parts })).toBe(covered > total / 2 ? 2 : undefined);
          expect(
            jevPartialGrade({
              kind,
              parts: [...parts, { start: total, end: total + 1, covered: null }],
            }),
          ).toBeUndefined();
        }
        for (const kind of ['wrong', 'blank', 'same', 'spelling', null] as const) {
          expect(jevPartialGrade({ kind, parts })).toBeUndefined();
        }
      }
    }
  });
});
