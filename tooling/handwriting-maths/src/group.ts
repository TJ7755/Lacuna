/** Stage 2: grouping strokes into symbols.
 *
 *  $P classifies one symbol. Deciding which strokes *constitute* one symbol is a
 *  separate problem, and for maths it is not optional: `=` is two strokes, `x` is two,
 *  `+` is two, and `4` and `5` usually are. Nothing downstream can work until this does.
 *
 *  The heuristic is horizontal: strokes belong together when their x-ranges overlap
 *  substantially, or when one sits inside the other's span. Maths is written left to
 *  right with symbols occupying distinct horizontal slots, so horizontal separation
 *  carries almost all the signal — and unlike a temporal rule it does not break when a
 *  writer goes back to cross a `t` or dot an `i`, which children do constantly.
 *
 *  Pure module: no DOM, no recogniser dependency.
 */

import { boundingBox, splitStrokes, type Box, type Point } from './strokes';

export interface SymbolGroup {
  points: Point[];
  box: Box;
  /** How many pen-downs went into this symbol. Useful when diagnosing over-merging. */
  strokes: number;
}

/** Length of the overlap between two intervals; negative when they are disjoint. */
const overlapLength = (a: Box, b: Box): number =>
  Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);

/** Whether one x-span sits inside the other, within a tolerance.
 *
 *  This is what catches `+` and `÷`: the vertical stroke of a `+` is nearly zero-width
 *  and overlaps the horizontal bar by almost nothing in absolute terms, but it is
 *  entirely contained within it. A pure ratio-of-overlap rule splits every `+` in two. */
const contained = (a: Box, b: Box, tolerance: number): boolean =>
  (a.minX >= b.minX - tolerance && a.maxX <= b.maxX + tolerance) ||
  (b.minX >= a.minX - tolerance && b.maxX <= a.maxX + tolerance);

export interface GroupOptions {
  /** Fraction of the narrower stroke's width that must overlap to merge. */
  overlapThreshold?: number;
  /** Containment slack, as a fraction of the wider stroke's width. */
  containmentTolerance?: number;
}

/** Partition a gesture's strokes into symbols, ordered left to right.
 *
 *  Strokes are processed in x order rather than in the order they were drawn, so a
 *  writer who completes `2x + 6` and then goes back to add the `=` still gets sane
 *  groups. */
export const groupStrokes = (
  points: Point[],
  { overlapThreshold = 0.5, containmentTolerance = 0.15 }: GroupOptions = {},
): SymbolGroup[] => {
  const strokes = splitStrokes(points).filter((stroke) => stroke.length > 0);
  if (strokes.length === 0) return [];

  const measured = strokes
    .map((stroke) => ({ stroke, box: boundingBox(stroke) }))
    .sort((a, b) => a.box.minX - b.box.minX);

  const groups: Array<{ strokes: Point[][]; box: Box }> = [];

  for (const { stroke, box } of measured) {
    const current = groups[groups.length - 1];
    if (!current) {
      groups.push({ strokes: [stroke], box });
      continue;
    }

    const overlap = overlapLength(current.box, box);
    const narrower = Math.min(current.box.width, box.width);
    const wider = Math.max(current.box.width, box.width);
    // A zero-width stroke (a dot, or a perfectly vertical `1`) has no ratio to take, so
    // containment is the only test that can succeed for it.
    const overlapsEnough = narrower > 0 && overlap >= overlapThreshold * narrower;
    const sitsInside = contained(current.box, box, containmentTolerance * wider);

    if (overlapsEnough || sitsInside) {
      current.strokes.push(stroke);
      current.box = boundingBox(current.strokes.flat());
    } else {
      groups.push({ strokes: [stroke], box });
    }
  }

  return groups.map(({ strokes: grouped, box }) => ({
    points: grouped.flat(),
    box,
    strokes: grouped.length,
  }));
};
