import { expect, it } from 'vitest';
import { splitJevExpectedAnswer } from './answerParts';

it('retains offsets into the original answer while trimming list separators and punctuation', () => {
  expect(splitJevExpectedAnswer(' red, blue and green. ')).toEqual([
    { start: 1, end: 4 },
    { start: 6, end: 10 },
    { start: 15, end: 20 },
  ]);
});
it.each([
  ['Water or glucose', ['Water', 'glucose']],
  ['A and B, C', ['A and B', 'C']],
  ['- Water;\n* Glucose;\n• Oxygen.', ['Water', 'Glucose', 'Oxygen']],
  ['1. Water\r\n2) Glucose\n+ Oxygen!', ['Water', 'Glucose', 'Oxygen']],
  ['water • glucose • oxygen', ['water', 'glucose', 'oxygen']],
  [
    String.raw`f(x, y), \frac{a,b}{c,d} and z.`,
    [String.raw`f(x, y)`, String.raw`\frac{a,b}{c,d}`, 'z'],
  ],
  [String.raw`\left\{a, b\right\}; c`, [String.raw`\left\{a, b\right\}`, 'c']],
  ['$a,b$ and $c,d$', ['$a,b$', '$c,d$']],
  ['(one, two and three), four', ['(one, two and three)', 'four']],
  ['unclosed (one, two', ['unclosed (one, two']],
  ['single answer.', ['single answer']],
  ['  ', []],
])('splits %s without cutting grouped maths', (expected, parts) => {
  expect(
    splitJevExpectedAnswer(expected).map(({ start, end }) => expected.slice(start, end)),
  ).toEqual(parts);
});
it('uses JavaScript string offsets for mathematical symbols outside the BMP', () => {
  expect(splitJevExpectedAnswer('𝛼, β')).toEqual([
    { start: 0, end: 2 },
    { start: 4, end: 5 },
  ]);
});
