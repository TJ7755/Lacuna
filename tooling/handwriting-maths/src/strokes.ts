/** Stroke capture and normalisation.
 *
 *  Pure module: no DOM, no canvas. The harness feeds it raw pointer coordinates and
 *  gets back a normalised point cloud suitable for $P (see `dollarP.ts`).
 */

/** One sampled point. `strokeId` groups points belonging to the same pen-down. */
export interface Point {
  x: number;
  y: number;
  strokeId: number;
}

/** Number of points every gesture is resampled to before matching. 32 is the $P
 *  reference value; accuracy is famously flat between roughly 16 and 64, and the cost
 *  of greedy matching is quadratic in this number. */
export const RESAMPLE_POINTS = 32;

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Summed segment length within a single stroke. */
const pathLength = (stroke: Point[]): number => {
  let total = 0;
  for (let i = 1; i < stroke.length; i++) total += distance(stroke[i - 1], stroke[i]);
  return total;
};

/** Split a flat point list into per-stroke lists, preserving order. */
export const splitStrokes = (points: Point[]): Point[][] => {
  const strokes: Point[][] = [];
  for (const point of points) {
    const last = strokes[strokes.length - 1];
    if (!last || last[0].strokeId !== point.strokeId) strokes.push([point]);
    else last.push(point);
  }
  return strokes;
};

/** Axis-aligned bounds. Canvas y grows downward, so `minY` is the *top* edge. */
export interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centreX: number;
  centreY: number;
}

export const boundingBox = (points: Point[]): Box => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centreX: (minX + maxX) / 2,
    centreY: (minY + maxY) / 2,
  };
};

/** Resample one stroke to exactly `count` evenly spaced points along its path. */
const resampleStroke = (stroke: Point[], count: number): Point[] => {
  if (count <= 0) return [];
  if (stroke.length === 1 || pathLength(stroke) === 0) {
    return Array.from({ length: count }, () => ({ ...stroke[0] }));
  }

  const interval = pathLength(stroke) / (count - 1);
  const resampled: Point[] = [{ ...stroke[0] }];
  let accumulated = 0;
  // `working` is mutated as we split segments, so iterate it by index rather than
  // with for..of.
  const working = stroke.slice();

  for (let i = 1; i < working.length; i++) {
    const previous = working[i - 1];
    const current = working[i];
    const segment = distance(previous, current);

    if (accumulated + segment >= interval) {
      const ratio = (interval - accumulated) / segment;
      const inserted: Point = {
        x: previous.x + ratio * (current.x - previous.x),
        y: previous.y + ratio * (current.y - previous.y),
        strokeId: previous.strokeId,
      };
      resampled.push(inserted);
      // Continue measuring from the inserted point rather than skipping the remainder
      // of this segment.
      working.splice(i, 0, inserted);
      accumulated = 0;
    } else {
      accumulated += segment;
    }
  }

  // Floating-point drift can leave us one point short of `count`.
  while (resampled.length < count) resampled.push({ ...stroke[stroke.length - 1] });
  return resampled.slice(0, count);
};

/** Resample a multi-stroke gesture to exactly `count` points in total, allocating
 *  points to each stroke in proportion to its path length.
 *
 *  This deviates deliberately from the $P reference implementation, which resamples the
 *  concatenated point list and therefore places phantom points along the invisible jump
 *  between one stroke's end and the next stroke's start. For maths symbols those jumps
 *  are large (the two strokes of `=` are far apart relative to their own length), so the
 *  phantom points carry real weight and are pure noise. */
export const resample = (points: Point[], count = RESAMPLE_POINTS): Point[] => {
  const strokes = splitStrokes(points);
  if (strokes.length === 0) return [];
  if (strokes.length === 1) return resampleStroke(strokes[0], count);

  const lengths = strokes.map(pathLength);
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);

  // Every stroke needs at least two points to describe a direction. A dot (zero length)
  // still gets its two, which is why the allocation is not purely proportional.
  const allocation = strokes.map((_, index) =>
    totalLength === 0 ? 2 : Math.max(2, Math.round((count * lengths[index]) / totalLength)),
  );

  // Reconcile rounding against the exact budget by adjusting the longest stroke, which
  // is the one least distorted by a point or two either way.
  let longest = 0;
  for (let i = 1; i < lengths.length; i++) if (lengths[i] > lengths[longest]) longest = i;
  const drift = count - allocation.reduce((sum, n) => sum + n, 0);
  allocation[longest] = Math.max(2, allocation[longest] + drift);

  return strokes.flatMap((stroke, index) => resampleStroke(stroke, allocation[index]));
};

/** Scale to a unit bounding box, preserving aspect ratio.
 *
 *  Uniform rather than per-axis scaling: `-` and `1` differ almost entirely in aspect
 *  ratio, and non-uniform scaling would map them onto each other. */
export const scaleToUnit = (points: Point[]): Point[] => {
  if (points.length === 0) return [];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const size = Math.max(width, height);
  if (size === 0) return points.map((p) => ({ ...p, x: 0, y: 0 }));
  return points.map((p) => ({ ...p, x: p.x / size, y: p.y / size }));
};

/** Translate so the centroid sits at the origin. */
export const translateToOrigin = (points: Point[]): Point[] => {
  if (points.length === 0) return [];
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points.map((p) => ({ ...p, x: p.x - cx, y: p.y - cy }));
};

/** The full normalisation $P expects: resample, scale, centre. */
export const normalise = (points: Point[], count = RESAMPLE_POINTS): Point[] =>
  translateToOrigin(scaleToUnit(resample(points, count)));
