/** The full pipeline: ink in, expression string out.
 *
 *  Stage 1 (capture) happens in `canvas.ts`; this joins stages 2, 3 and 4 so the canvas
 *  arm of the trial can finally be scored against a target rather than self-reported.
 */

import { groupStrokes, type GroupOptions } from './group';
import { recognise, type Template } from './dollarP';
import { toExpression, type LayoutOptions, type PlacedSymbol } from './layout';
import { labelToOutput } from './symbols';
import type { Point } from './strokes';

export interface InterpretedSymbol extends PlacedSymbol {
  /** Best-match distance, so a caller can flag low-confidence readings. */
  distance: number;
  score: number;
  strokes: number;
}

export interface Interpretation {
  expression: string;
  symbols: InterpretedSymbol[];
}

export interface InterpretOptions extends GroupOptions, LayoutOptions {}

export const interpret = (
  points: Point[],
  templates: readonly Template[],
  options: InterpretOptions = {},
): Interpretation => {
  const groups = groupStrokes(points, options);

  const symbols = groups.flatMap<InterpretedSymbol>((group) => {
    const [best] = recognise(group.points, templates);
    // An ungrouped or unrecognisable blob is dropped rather than guessed at: a wrong
    // symbol silently corrupts the expression, whereas a missing one shows up as a
    // mismatch against the target, which is the honest failure.
    if (!best) return [];
    return [
      {
        label: best.label,
        box: group.box,
        distance: best.distance,
        score: best.score,
        strokes: group.strokes,
      },
    ];
  });

  return { expression: toExpression(symbols, labelToOutput, options), symbols };
};
