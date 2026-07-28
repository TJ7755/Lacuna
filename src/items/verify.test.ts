import { describe, expect, it } from 'vitest';
import type { MarkSchemeLine, NumericAnswerSpec } from '../db/types';
import {
  checkNumeric,
  equivalentByRandomEvaluation,
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
});

describe('equivalentByRandomEvaluation', () => {
  it.each([
    ['8 / 2', '4'],
    ['2 * (x + 3)', '2x + 6'],
    ['x^2 + 2x + 1', '(x + 1)^2'],
    ['2x + 6 = 14', '2x - 8 = 0'],
  ])('accepts equivalent forms %s and %s', (left, right) => {
    expect(equivalentByRandomEvaluation(expression(left), expression(right), 'item:attempt')).toBe(
      true,
    );
  });

  it('rejects expressions that merely agree at one obvious value', () => {
    expect(equivalentByRandomEvaluation(expression('x^2'), expression('x'), 'seed')).toBe(false);
  });

  it('draws across positive and negative values for piecewise expressions', () => {
    expect(
      equivalentByRandomEvaluation(expression('sqrt(x^2)'), expression('x'), 'piecewise'),
    ).toBe(false);
  });

  it('is reproducible for the same seed', () => {
    const left = expression('x^3 - x');
    const right = expression('x * (x - 1) * (x + 1)');
    const first = equivalentByRandomEvaluation(left, right, 'repeatable-seed');
    const second = equivalentByRandomEvaluation(left, right, 'repeatable-seed');
    expect(second).toBe(first);
    expect(first).toBe(true);
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
      lineVerdicts: [
        { studentLine: 'Used SUBSTITUTION', matchedLineIndex: 3, marksEarned: 1 },
        { studentLine: '8 / 2', matchedLineIndex: 1, marksEarned: 2 },
        { studentLine: '7.995', matchedLineIndex: 2, marksEarned: 1 },
        { studentLine: '2 * (x + 3)', matchedLineIndex: 0, marksEarned: 1 },
      ],
    });
  });

  it('awards each scheme line at most once and records malformed lines as misses', () => {
    const result = verifyWorkingLines(['4', '4.0', '2 +'], scheme, 'working-attempt');
    expect(result.marksEarned).toBe(2);
    expect(result.lineVerdicts).toEqual([
      { studentLine: '4', matchedLineIndex: 1, marksEarned: 2 },
      { studentLine: '4.0', matchedLineIndex: null, marksEarned: 0 },
      { studentLine: '2 +', matchedLineIndex: null, marksEarned: 0 },
    ]);
  });

  it('returns identical verdicts for the same seed', () => {
    const lines = ['2 * (x + 3)', '8 / 2'];
    expect(verifyWorkingLines(lines, scheme, 'same-seed')).toEqual(
      verifyWorkingLines(lines, scheme, 'same-seed'),
    );
  });
});
