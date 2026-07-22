/** Stage 4: turning positioned symbols into a linear expression string.
 *
 *  Scope is baseline plus superscript, deliberately. That covers `x^2`, which is the
 *  expression the whole prototype is named after and the character the first trial
 *  identified as the expensive one to type. Fraction bars — which need recursive spatial
 *  parsing, numerator above and denominator below a bar — are out of scope for this
 *  pass; `/` covers division.
 *
 *  Pure module: takes labelled boxes, returns a string. It never sees ink.
 */

import type { Box } from './strokes';

export interface PlacedSymbol {
  /** Symbol class from the recogniser. */
  label: string;
  box: Box;
}

/** Median: robust to one oddly sized symbol, which a mean is not. A single stray dot
 *  should not move the estimate of how tall normal writing is. */
const median = (values: readonly number[]): number => {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

export interface LayoutOptions {
  /** How far above the baseline a symbol's foot must sit to count as raised, as a
   *  fraction of typical symbol height. */
  raiseThreshold?: number;
  /** A superscript is also smaller. Ceiling on its height, as a fraction of typical. */
  maxRelativeHeight?: number;
}

/** Decide which symbols are superscripts.
 *
 *  Two conditions, both required. A symbol must sit clear of the baseline *and* be
 *  smaller than normal. Height alone would promote every full stop and comma; position
 *  alone would promote the upper half of anything written unevenly, which is most of
 *  what a child writes. */
const findRaised = (
  symbols: readonly PlacedSymbol[],
  raiseThreshold: number,
  maxRelativeHeight: number,
): boolean[] => {
  if (symbols.length < 2) return symbols.map(() => false);

  // Reference height is the tallest symbol, not the median. A median is the safer
  // statistic in general, but it fails the case this exists to handle: in `x^12` two of
  // the three symbols are exponents, so the median height *is* the exponent height and
  // every symbol then looks full-sized. Using the maximum is sensitive to one oversized
  // stroke, which is an acceptable trade here — symbols within one expression are
  // similar in size, and a wildly outsized box means grouping already failed.
  const referenceHeight = Math.max(...symbols.map((s) => s.box.height));
  if (!(referenceHeight > 0)) return symbols.map(() => false);

  // The baseline is where full-height symbols rest. Estimating it from every symbol
  // would drag it upwards on an expression containing a superscript, which is precisely
  // when it must not move.
  const fullHeight = symbols.filter((s) => s.box.height >= 0.6 * referenceHeight);
  const baseline = median((fullHeight.length ? fullHeight : symbols).map((s) => s.box.maxY));

  return symbols.map((symbol, index) => {
    // Nothing can be a superscript of nothing.
    if (index === 0) return false;
    const clearOfBaseline = symbol.box.maxY < baseline - raiseThreshold * referenceHeight;
    const smaller = symbol.box.height <= maxRelativeHeight * referenceHeight;
    return clearOfBaseline && smaller;
  });
};

/** Compose an expression string from symbols already ordered left to right.
 *
 *  `toOutput` maps a recogniser label onto the characters it contributes, so this module
 *  stays ignorant of the symbol table. */
export const toExpression = (
  symbols: readonly PlacedSymbol[],
  toOutput: (label: string) => string,
  { raiseThreshold = 0.3, maxRelativeHeight = 0.8 }: LayoutOptions = {},
): string => {
  const ordered = symbols.slice().sort((a, b) => a.box.centreX - b.box.centreX);
  const raised = findRaised(ordered, raiseThreshold, maxRelativeHeight);

  let result = '';
  let run: string[] = [];

  const flushRun = () => {
    if (run.length === 0) return;
    // `x^12` would be read as x to the twelfth by a parser, which is what was written,
    // but only because the digits are adjacent. Bracketing keeps a multi-symbol
    // exponent unambiguous the moment it contains an operator.
    result += run.length === 1 ? `^${run[0]}` : `^(${run.join('')})`;
    run = [];
  };

  ordered.forEach((symbol, index) => {
    const output = toOutput(symbol.label);
    if (raised[index]) run.push(output);
    else {
      flushRun();
      result += output;
    }
  });
  flushRun();

  return result;
};
