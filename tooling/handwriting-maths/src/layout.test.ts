import { describe, expect, it } from 'vitest';
import { toExpression, type PlacedSymbol } from './layout';
import { boundingBox, type Point } from './strokes';

/** Build a placed symbol from an explicit rectangle, in canvas coordinates where y
 *  grows downward — so a smaller `top` means higher on the page. */
const at = (label: string, left: number, top: number, width: number, height: number): PlacedSymbol => {
  const corners: Point[] = [
    { x: left, y: top, strokeId: 0 },
    { x: left + width, y: top + height, strokeId: 0 },
  ];
  return { label, box: boundingBox(corners) };
};

/** Identity mapping: these tests are about placement, not the symbol table. */
const output = (label: string) => label;

describe('toExpression', () => {
  it('reads symbols left to right on a shared baseline', () => {
    const expression = toExpression(
      [at('4', 0, 0, 20, 40), at('2', 30, 0, 20, 40)],
      output,
    );
    expect(expression).toBe('42');
  });

  it('sorts by position, not by the order supplied', () => {
    const expression = toExpression(
      [at('2', 30, 0, 20, 40), at('4', 0, 0, 20, 40)],
      output,
    );
    expect(expression).toBe('42');
  });

  it('emits `^` for a raised, smaller symbol', () => {
    // `x` occupies the baseline; `2` is small and sits clear above it.
    const expression = toExpression(
      [at('x', 0, 20, 30, 40), at('2', 35, 0, 15, 20)],
      output,
    );
    expect(expression).toBe('x^2');
  });

  it('brackets a multi-symbol exponent', () => {
    const expression = toExpression(
      [at('x', 0, 20, 30, 40), at('1', 35, 0, 12, 20), at('2', 50, 0, 12, 20)],
      output,
    );
    expect(expression).toBe('x^(12)');
  });

  it('closes an exponent when the baseline resumes', () => {
    // `x^2+3`: the `+` returns to the baseline and must end the superscript run.
    const expression = toExpression(
      [
        at('x', 0, 20, 30, 40),
        at('2', 35, 0, 15, 20),
        at('+', 55, 20, 30, 40),
        at('3', 90, 20, 30, 40),
      ],
      output,
    );
    expect(expression).toBe('x^2+3');
  });

  it('does not promote a full stop, which is small but low', () => {
    // Height alone would make every decimal point an exponent.
    const expression = toExpression(
      [at('5', 0, 0, 20, 40), at('.', 25, 36, 4, 4), at('5', 35, 0, 20, 40)],
      output,
    );
    expect(expression).toBe('5.5');
  });

  it('does not promote a full-height symbol that merely sits high', () => {
    // A tall bracket riding above the line is not an exponent.
    const expression = toExpression(
      [at('(', 0, 0, 10, 40), at('3', 20, 10, 20, 40)],
      output,
    );
    expect(expression).toBe('(3');
  });

  it('never treats the first symbol as an exponent', () => {
    // Nothing can be raised above nothing, however small and high it is.
    const expression = toExpression(
      [at('2', 0, 0, 10, 12), at('x', 20, 20, 30, 40)],
      output,
    );
    expect(expression).toBe('2x');
  });

  it('keeps the baseline steady on an expression that ends in an exponent', () => {
    // Estimating the baseline from every symbol would drag it upwards here, which is
    // exactly when it must not move.
    const expression = toExpression(
      [
        at('y', 0, 20, 25, 40),
        at('=', 30, 30, 25, 20),
        at('2', 60, 20, 25, 40),
        at('x', 90, 20, 25, 40),
        at('2', 120, 4, 14, 18),
      ],
      output,
    );
    expect(expression).toBe('y=2x^2');
  });

  it('maps labels through the supplied table', () => {
    const expression = toExpression(
      [at('plus', 0, 0, 20, 40)],
      (label) => (label === 'plus' ? '+' : label),
    );
    expect(expression).toBe('+');
  });

  it('handles empty input and a lone symbol', () => {
    expect(toExpression([], output)).toBe('');
    expect(toExpression([at('7', 0, 0, 20, 40)], output)).toBe('7');
  });
});
