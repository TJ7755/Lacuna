import { describe, expect, it } from 'vitest';
import type { MarkSchemeLine, NumericAnswerSpec } from '../db/types';
import {
  checkNumeric,
  compareByRandomEvaluation,
  expressionToTex,
  parseExpression,
  verifyWorkingLines,
} from './verify';

function expression(source: string) {
  const result = parseExpression(source);
  if (!result.ok) throw new Error(result.error.message);
  return result.expression;
}

describe('parseExpression', () => {
  it.each([
    ['2x + 6', ['x']],
    ['sqrt(16)', []],
    ['2x + 6 = 14', ['x']],
  ])('parses %s into the shared expression representation', (source, variables) => {
    const result = parseExpression(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.expression.variables).toEqual(variables);
  });

  it.each(['2 +', '2x =', 'x = 1 = 2', '[1, 2]', 'evaluate("2 + 2")', 'x = 4; x'])(
    'surfaces %s as a structured error instead of throwing',
    (source) => {
      const result = parseExpression(source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).not.toBe('');
    },
  );

  it.each([
    ['3/4', '\\frac{3}{4}'],
    ['x^2', '{ x}^{2}'],
    ['2x + 6 = 14', '2~ x+6 = 14'],
  ])('formats %s for the existing KaTeX rendering path', (source, expected) => {
    expect(expressionToTex(expression(source))).toBe(expected);
  });
});

describe('compareByRandomEvaluation', () => {
  it.each([
    ['8 / 2', '4'],
    ['2 * (x + 3)', '2x + 6'],
    ['x^2 + 2x + 1', '(x + 1)^2'],
    ['2x + 6 = 14', '2x - 8 = 0'],
  ])('accepts equivalent forms %s and %s', (left, right) => {
    expect(compareByRandomEvaluation(expression(left), expression(right), 'item:attempt')).toBe(
      'equivalent',
    );
  });

  it('rejects expressions that merely agree at one obvious value', () => {
    expect(compareByRandomEvaluation(expression('x^2'), expression('x'), 'seed')).toBe('different');
  });

  it('draws across positive and negative values for piecewise expressions', () => {
    expect(compareByRandomEvaluation(expression('sqrt(x^2)'), expression('x'), 'piecewise')).toBe(
      'different',
    );
  });

  it.each([
    ['abs(x * y)', '-x * y'],
    ['abs(x * y)', 'x * y'],
    ['abs(x + y)', 'x + y'],
  ])('samples every sign combination, so %s and %s differ', (left, right) => {
    expect(compareByRandomEvaluation(expression(left), expression(right), 'signs')).toBe(
      'different',
    );
  });

  it('separates "cannot check" from "differs" for domain-restricted expressions', () => {
    expect(
      compareByRandomEvaluation(expression('sqrt(x - 100)'), expression('sqrt(x - 100)'), 'domain'),
    ).toBe('equivalent');
    expect(
      compareByRandomEvaluation(expression('sqrt(x - 100)'), expression('sqrt(x - 200)'), 'domain'),
    ).toBe('different');
    expect(
      compareByRandomEvaluation(expression('sqrt(0 - x^2 - 1)'), expression('x'), 'empty-domain'),
    ).toBe('undetermined');
  });

  it('is reproducible for the same seed', () => {
    const left = expression('x^3 - x');
    const right = expression('x * (x - 1) * (x + 1)');
    const first = compareByRandomEvaluation(left, right, 'repeatable-seed');
    const second = compareByRandomEvaluation(left, right, 'repeatable-seed');
    expect(second).toBe(first);
    expect(first).toBe('equivalent');
  });
});

describe('checkNumeric', () => {
  const cases: [string, NumericAnswerSpec, boolean][] = [
    ['4.0', { kind: 'exact', value: '8 / 2' }, true],
    ['2 * pi', { kind: 'exact', value: 'pi + pi' }, true],
    ['4.01', { kind: 'within', value: '4', tolerance: 0.01 }, true],
    ['4.0101', { kind: 'within', value: '4', tolerance: 0.01 }, false],
    ['3 / 4', { kind: 'matches-one-of', values: ['0.5', '0.75', '1'] }, true],
    ['x', { kind: 'exact', value: '4' }, false],
  ];

  it.each(cases)('checks %s against the numeric specification', (source, spec, expected) => {
    expect(checkNumeric(expression(source), spec)).toBe(expected);
  });
});

describe('verifyWorkingLines', () => {
  const scheme: MarkSchemeLine[] = [
    { marks: 1, label: 'expand', kind: 'waypoint', expression: '2x + 6' },
    { marks: 2, label: 'value', kind: 'predicate', predicate: 'equals', args: ['4'] },
    {
      marks: 1,
      label: 'check',
      kind: 'predicate',
      predicate: 'within',
      args: ['0.01', '8'],
    },
    {
      marks: 1,
      label: 'method',
      kind: 'predicate',
      predicate: 'contains',
      args: ['substitution'],
    },
  ];

  it('matches outstanding waypoints and predicates out of order', () => {
    const result = verifyWorkingLines(
      ['Used SUBSTITUTION', '8 / 2', '7.995', '2 * (x + 3)'],
      scheme,
      'working-attempt',
    );

    expect(result).toEqual({
      marksEarned: 5,
      marksAvailable: 5,
      undeterminedLines: 0,
      lineVerdicts: [
        { studentLine: 'Used SUBSTITUTION', matchedLineIndex: 3, marksEarned: 1, checkerSeeds: ['working-attempt:0:0', 'working-attempt:0:1'] },
        { studentLine: '8 / 2', matchedLineIndex: 1, marksEarned: 2, checkerSeeds: ['working-attempt:1:0', 'working-attempt:1:1'] },
        { studentLine: '7.995', matchedLineIndex: 2, marksEarned: 1, checkerSeeds: ['working-attempt:2:0'] },
        { studentLine: '2 * (x + 3)', matchedLineIndex: 0, marksEarned: 1, checkerSeeds: ['working-attempt:3:0'] },
      ],
    });
  });

  it('awards each scheme line at most once and records malformed lines as misses', () => {
    const result = verifyWorkingLines(['4', '4.0', '2 +'], scheme, 'working-attempt');
    expect(result.marksEarned).toBe(2);
    expect(result.lineVerdicts).toEqual([
      { studentLine: '4', matchedLineIndex: 1, marksEarned: 2, checkerSeeds: ['working-attempt:0:0', 'working-attempt:0:1'] },
      { studentLine: '4.0', matchedLineIndex: null, marksEarned: 0, checkerSeeds: ['working-attempt:1:0'] },
      { studentLine: '2 +', matchedLineIndex: null, marksEarned: 0, checkerSeeds: ['working-attempt:2:0'] },
    ]);
  });

  it('returns identical verdicts for the same seed', () => {
    const lines = ['2 * (x + 3)', '8 / 2'];
    expect(verifyWorkingLines(lines, scheme, 'same-seed')).toEqual(
      verifyWorkingLines(lines, scheme, 'same-seed'),
    );
  });

  it('records an uncheckable scheme line as undetermined rather than a student miss', () => {
    const brokenScheme: MarkSchemeLine[] = [
      { marks: 2, label: 'expand', kind: 'waypoint', expression: '2x +' },
    ];
    const result = verifyWorkingLines(['2x + 6'], brokenScheme, 'broken');

    expect(result.marksEarned).toBe(0);
    expect(result.undeterminedLines).toBe(1);
    expect(result.lineVerdicts[0]).toMatchObject({
      matchedLineIndex: null,
      marksEarned: 0,
      undetermined: true,
    });
  });

  it('leaves genuine misses free of the undetermined flag', () => {
    const result = verifyWorkingLines(['x + 1'], scheme, 'miss');

    expect(result.undeterminedLines).toBe(0);
    expect(result.lineVerdicts[0].undetermined).toBeUndefined();
  });
});

describe('verifyWorkingLines: answers written as "<variable> = value"', () => {
  function marksFor(line: MarkSchemeLine, studentLine: string): number {
    return verifyWorkingLines([studentLine], [line], 'named-answer').marksEarned;
  }

  const equals: MarkSchemeLine = {
    marks: 1,
    label: 'y',
    kind: 'predicate',
    predicate: 'equals',
    args: ['3'],
  };

  it('earns an equals criterion whether the value is bare or named', () => {
    expect(marksFor(equals, '3')).toBe(1);
    expect(marksFor(equals, 'y = 3')).toBe(1);
    expect(marksFor(equals, 'y=3')).toBe(1);
    expect(marksFor(equals, '  y   =   3  ')).toBe(1);
  });

  it('accepts a named answer whose variable differs from the criterion label', () => {
    expect(marksFor(equals, 'x = 3')).toBe(1);
    expect(marksFor({ ...equals, label: 'final answer' }, 'y = 3')).toBe(1);
  });

  it('accepts multi-character and equivalent named values', () => {
    expect(marksFor({ ...equals, args: ['12'] }, 'total = 12')).toBe(1);
    expect(marksFor({ ...equals, args: ['18/7'] }, 'x = 18/7')).toBe(1);
    expect(marksFor({ ...equals, args: ['6'] }, 'x = 12/2')).toBe(1);
  });

  it('still refuses a named answer with the wrong value', () => {
    expect(marksFor(equals, 'y = 5')).toBe(0);
    expect(marksFor(equals, '5')).toBe(0);
  });

  it('reduces only a bare variable, so equations keep their meaning', () => {
    // The left side is arithmetic, not a name, so this stays the equation 6 + 4 - 10.
    expect(marksFor({ ...equals, args: ['10'] }, '6+4=10')).toBe(0);
    expect(marksFor({ ...equals, args: ['6'] }, '2y = 6')).toBe(0);
  });

  it('leaves waypoint equations untouched', () => {
    const waypoint: MarkSchemeLine = {
      marks: 1,
      label: 'elimination',
      kind: 'waypoint',
      expression: '2y = 6',
    };

    expect(marksFor(waypoint, '2y = 6')).toBe(1);
    expect(marksFor(waypoint, 'y = 3')).toBe(0);
  });

  it('applies to the other value predicates', () => {
    const within: MarkSchemeLine = {
      marks: 1,
      label: 'estimate',
      kind: 'predicate',
      predicate: 'within',
      args: ['0.01', '8'],
    };
    const oneOf: MarkSchemeLine = {
      marks: 1,
      label: 'root',
      kind: 'predicate',
      predicate: 'matches-one-of',
      args: ['2', '-2'],
    };

    expect(marksFor(within, 'x = 7.995')).toBe(1);
    expect(marksFor(within, 'x = 9')).toBe(0);
    expect(marksFor(oneOf, 'x = -2')).toBe(1);
    expect(marksFor(oneOf, 'x = 5')).toBe(0);
  });
});
