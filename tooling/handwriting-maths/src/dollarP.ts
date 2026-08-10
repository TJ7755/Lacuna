/** The $P point-cloud recogniser (Vatavu, Anthony and Wobbrock, ICMI 2012).
 *
 *  Chosen over $1 because $1 handles single strokes only and therefore cannot represent
 *  `=`, `x` or a two-stroke `4`. $P treats a gesture as an unordered cloud, so it is
 *  invariant to stroke order and stroke count: a child writing `4` in one stroke and a
 *  child writing it in two produce the same class rather than needing two templates.
 *
 *  Pure module: no DOM, no state. Unit-tested standalone, following the precedent of
 *  `src/fsrs/forwardSim.ts` in the main application.
 */

import { normalise, RESAMPLE_POINTS, type Point } from './strokes';

/** A labelled reference gesture, already normalised. */
export interface Template {
  /** The symbol this template stands for, e.g. `x`, `+`, `7`. */
  label: string;
  points: Point[];
  /** Where the template came from. Per-user templates are the interesting variable
   *  (see README); keeping the provenance lets the report separate the two. */
  source: 'user' | 'corpus';
}

export interface Match {
  label: string;
  /** Mean weighted point-to-point distance. Lower is better; 0 is identical. */
  distance: number;
  /** `distance` mapped to [0, 1] for display. Not a probability. */
  score: number;
}

const euclidean = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Greedy nearest-neighbour alignment from `from` into `to`, starting at index `start`.
 *
 *  Points matched early are weighted most heavily: the first point matched is the one
 *  we are most confident about, so a bad match there should cost more than a bad match
 *  among the leftovers. Returns the *mean* weighted distance rather than the reference
 *  implementation's sum, so the figure is comparable across different resample counts. */
const cloudDistance = (from: Point[], to: Point[], start: number): number => {
  const n = from.length;
  const matched = new Array<boolean>(n).fill(false);
  let sum = 0;
  let i = start;

  do {
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue;
      const d = euclidean(from[i], to[j]);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = j;
      }
    }
    matched[nearest] = true;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * nearestDistance;
    i = (i + 1) % n;
  } while (i !== start);

  return sum / n;
};

/** Distance between two normalised clouds, minimised over several start points.
 *
 *  The greedy alignment depends on where it starts, so the reference algorithm tries
 *  n^(1-eps) starting points with eps = 0.5 and keeps the best. Both directions are
 *  tried because greedy matching is not symmetric. */
export const greedyCloudMatch = (a: Point[], b: Point[]): number => {
  const n = a.length;
  if (n === 0 || b.length !== n) return Infinity;
  const step = Math.max(1, Math.floor(n ** 0.5));
  let best = Infinity;
  for (let i = 0; i < n; i += step) {
    best = Math.min(best, cloudDistance(a, b, i), cloudDistance(b, a, i));
  }
  return best;
};

/** Build a template from raw captured points. */
export const makeTemplate = (
  label: string,
  points: Point[],
  source: Template['source'],
  count = RESAMPLE_POINTS,
): Template => ({ label, points: normalise(points, count), source });

/** Rank templates against a captured gesture, best first.
 *
 *  Returns every candidate rather than only the winner: the report needs top-k accuracy
 *  and the confusion structure (which symbols collide) far more than it needs top-1. */
export const recognise = (
  points: Point[],
  templates: readonly Template[],
  count = RESAMPLE_POINTS,
): Match[] => {
  if (templates.length === 0) return [];
  const candidate = normalise(points, count);
  if (candidate.length === 0) return [];

  // The largest distance two clouds inside a unit box can plausibly reach. Used only to
  // map distance onto a readable 0-1 score; it carries no probabilistic meaning.
  const maxDistance = Math.SQRT2;

  return templates
    .map(({ label, points: template }) => {
      const distance = greedyCloudMatch(candidate, template);
      return {
        label,
        distance,
        score: Math.max(0, 1 - distance / maxDistance),
      };
    })
    .sort((a, b) => a.distance - b.distance);
};
