import { describe, expect, it } from 'vitest';
import type { MarkSchemeLine } from '../db/types';
import {
  compileMarkScheme,
  renderLineAsEnglish,
  serialiseMarkScheme,
  suggestMarkSchemePredicates,
  type MarkSchemeCompileError,
} from './markSchemeCompiler';

interface CompilerFixture {
  name: string;
  source: string;
  expectedTotal: number;
  expectedValues: MarkSchemeLine[];
  expectedErrors?: string[];
}

/** Shared compiler corpus for the editor, staging and MCP boundary regression suites. */
export const MARK_SCHEME_COMPILER_FIXTURES: CompilerFixture[] = [
  {
    name: 'worked example',
    source: [
      '[1] substitution :: 2x = 8',
      '[1] solve :: x = 4',
      '[1] check :: within 0.01 :: 4.0',
    ].join('\n'),
    expectedTotal: 3,
    expectedValues: [
      { marks: 1, label: 'substitution', kind: 'waypoint', expression: '2x = 8' },
      { marks: 1, label: 'solve', kind: 'waypoint', expression: 'x = 4' },
      {
        marks: 1,
        label: 'check',
        kind: 'predicate',
        predicate: 'within',
        args: ['0.01', '4.0'],
      },
    ],
  },
  {
    name: 'all v1 predicates and an omitted label',
    source: [
      '[2] final :: equals :: 8 / 2',
      '[1] choice :: matches-one-of :: 3 :: 4 :: 5',
      '[1] method :: contains :: substitution',
      '[1] :: x + x',
    ].join('\n'),
    expectedTotal: 5,
    expectedValues: [
      {
        marks: 2,
        label: 'final',
        kind: 'predicate',
        predicate: 'equals',
        args: ['8 / 2'],
      },
      {
        marks: 1,
        label: 'choice',
        kind: 'predicate',
        predicate: 'matches-one-of',
        args: ['3', '4', '5'],
      },
      {
        marks: 1,
        label: 'method',
        kind: 'predicate',
        predicate: 'contains',
        args: ['substitution'],
      },
      { marks: 1, kind: 'waypoint', expression: 'x + x' },
    ],
  },
  {
    name: 'one bad line does not discard valid neighbours',
    source: ['[1] first :: x + 1', '[1] broken :: wthin 0.1 :: 4', '[2] last :: equals :: 9'].join(
      '\n',
    ),
    expectedTotal: 3,
    expectedValues: [
      { marks: 1, label: 'first', kind: 'waypoint', expression: 'x + 1' },
      {
        marks: 2,
        label: 'last',
        kind: 'predicate',
        predicate: 'equals',
        args: ['9'],
      },
    ],
    expectedErrors: ["I don't recognise 'wthin' — did you mean 'within'?"],
  },
];

describe('compileMarkScheme fixture corpus', () => {
  it.each(MARK_SCHEME_COMPILER_FIXTURES)('$name', (fixture) => {
    const result = compileMarkScheme(fixture.source);
    expect(result.totalMarks).toBe(fixture.expectedTotal);
    expect(
      result.lines.filter((line) => line.kind === 'compiled').map((line) => line.value),
    ).toEqual(fixture.expectedValues);
    expect(
      result.lines.filter((line) => line.kind === 'error').map((line) => line.message),
    ).toEqual(fixture.expectedErrors ?? []);
  });
});

describe('compileMarkScheme errors', () => {
  const cases: [string, string, string][] = [
    ['missing marks', 'substitution :: 2x = 8', 'Start the line with marks'],
    ['invalid marks', '[0] substitution :: 2x = 8', 'positive whole number'],
    ['fractional marks', '[1.5] substitution :: 2x = 8', 'positive whole number'],
    ['missing separator', '[1] substitution 2x = 8', 'Add ::'],
    ['missing body', '[1] substitution ::', 'Add an expression or predicate'],
    ['bad expression', '[1] substitution :: 2x +', 'Unexpected end of expression'],
    ['bad tolerance', '[1] check :: within nope :: 4', 'tolerance must be'],
    ['missing tolerance target', '[1] check :: within 0.1', 'Use the form within'],
    ['non-constant tolerance target', '[1] check :: within 0.1 :: x', 'without variables'],
    ['bad equals shape', '[1] answer :: equals 4', 'Use the form equals'],
    ['empty membership value', '[1] answer :: matches-one-of :: 3 ::', 'Use the form'],
    ['too many contains values', '[1] method :: contains :: one :: two', 'Use the form contains'],
    ['unknown predicate', '[1] answer :: approximately :: 4', "don't recognise the predicate"],
  ];

  it.each(cases)('%s', (_name, source, messagePart) => {
    const result = compileMarkScheme(source);
    expect(result.totalMarks).toBe(0);
    expect(result.lines).toHaveLength(1);
    const error = result.lines[0] as MarkSchemeCompileError;
    expect(error.kind).toBe('error');
    expect(error.message).toContain(messagePart);
    expect(error.lineNumber).toBe(1);
    expect(error.column).toBeGreaterThan(0);
    expect(error.length).toBeGreaterThan(0);
  });

  it('ignores blank lines while retaining physical source line numbers', () => {
    const result = compileMarkScheme('\n[1] good :: 4\n\nno marks');
    expect(result.lines.map((line) => line.lineNumber)).toEqual([2, 4]);
    expect(result.totalMarks).toBe(1);
  });
});

describe('renderLineAsEnglish', () => {
  const cases: [MarkSchemeLine, string][] = [
    [
      { marks: 1, label: 'substitution', kind: 'waypoint', expression: '2x = 8' },
      '1 mark — substitution — any line equivalent to 2x = 8',
    ],
    [
      {
        marks: 2,
        label: 'check',
        kind: 'predicate',
        predicate: 'within',
        args: ['0.01', '4.0'],
      },
      '2 marks — check — within 0.01 of 4.0',
    ],
    [
      {
        marks: 1,
        kind: 'predicate',
        predicate: 'matches-one-of',
        args: ['3', '4', '5'],
      },
      '1 mark — matches one of 3, 4 or 5',
    ],
    [
      {
        marks: 1,
        label: 'method',
        kind: 'predicate',
        predicate: 'contains',
        args: ['substitution'],
      },
      '1 mark — method — contains “substitution”',
    ],
  ];

  it.each(cases)('renders a plain-English preview', (line, expected) => {
    expect(renderLineAsEnglish(line)).toBe(expected);
  });
});

describe('mark-scheme authoring helpers', () => {
  it('suggests the nearest supported predicate for a typo', () => {
    expect(suggestMarkSchemePredicates('wthin')).toEqual(['within']);
    expect(suggestMarkSchemePredicates('match')).toEqual(['matches-one-of']);
  });

  it('serialises persisted criteria back into canonical editable source', () => {
    expect(
      serialiseMarkScheme([
        { marks: 1, label: 'method', kind: 'waypoint', expression: '2x = 8' },
        {
          marks: 2,
          label: 'answer',
          kind: 'predicate',
          predicate: 'within',
          args: ['0.1', '4'],
        },
      ]),
    ).toBe('[1] method :: 2x = 8\n[2] answer :: within 0.1 :: 4');
  });
});
