/**
 * Eases a stepped series into a calm curve for display: a short centred moving
 * average that keeps the first and last points exact. A rising series stays rising.
 */
export function easeSeries(values: number[], radius = 3): number[] {
  const n = values.length;
  return values.map((value, index) => {
    if (index === 0 || index === n - 1) return value;
    const reach = Math.min(radius, index, n - 1 - index);
    let sum = 0;
    for (let k = index - reach; k <= index + reach; k++) sum += values[k];
    return sum / (reach * 2 + 1);
  });
}

/** Five tidy ticks from 100% down, stepping by a round amount that reaches every value. */
export function recallTicks(values: number[]): number[] {
  const lowest = Math.min(0.9, ...values.filter(Number.isFinite));
  const step =
    [0.05, 0.1, 0.2, 0.25].find((candidate) => 1 - 4 * candidate <= lowest - 0.02) ?? 0.25;
  return [0, 1, 2, 3, 4].map((i) => Math.round((1 - step * i) * 100) / 100);
}

/**
 * A monotone cubic through the points (Fritsch and Carlson), so the curve never
 * swings above or below the values it joins.
 */
export function smoothPath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return '';
  const f = (value: number) => value.toFixed(1);
  if (n < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ');
  const slopes = points.slice(1).map((p, i) => (p.y - points[i].y) / (p.x - points[i].x || 1));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    const [a, b] = [slopes[i - 1], slopes[i]];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < n; i++) {
    const p = points[i - 1];
    const q = points[i];
    const h = (q.x - p.x) / 3;
    d += ` C${f(p.x + h)} ${f(p.y + tangents[i - 1] * h)}, ${f(q.x - h)} ${f(q.y - tangents[i] * h)}, ${f(q.x)} ${f(q.y)}`;
  }
  return d;
}

/**
 * Spreads label centres at least `gap` apart while keeping each as close to its point as it
 * can and all of them between `top` and `bottom`. Returns positions in the input order.
 */
export function spreadLabels(ys: number[], top: number, bottom: number, gap: number): number[] {
  const order = ys.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y);
  const placed = order.map((entry) => Math.min(bottom, Math.max(top, entry.y)));
  for (let i = 1; i < placed.length; i++) placed[i] = Math.max(placed[i], placed[i - 1] + gap);
  // Anything pushed past the floor shifts the stack back up from it.
  for (let i = placed.length - 1; i >= 0; i--) {
    const limit = i === placed.length - 1 ? bottom : placed[i + 1] - gap;
    placed[i] = Math.min(placed[i], limit);
  }
  const result = new Array<number>(ys.length);
  order.forEach((entry, i) => (result[entry.index] = placed[i]));
  return result;
}
