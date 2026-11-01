export const FLOW_CORNER_EXPONENT = 2 ** 1.5;

export interface FlowPoint {
  x: number;
  y: number;
}
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Sample the continuous corners of the measured expanding shell. */
export function flowOutline(
  width: number,
  height: number,
  radius: number,
  exponent = FLOW_CORNER_EXPONENT,
): FlowPoint[] {
  const r = Math.min(radius, width / 2, height / 2);
  const points: FlowPoint[] = [{ x: r, y: 0 }];
  const line = (x: number, y: number) => {
    const from = points[points.length - 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / 8));
    for (let i = 1; i <= steps; i++)
      points.push({
        x: from.x + ((x - from.x) * i) / steps,
        y: from.y + ((y - from.y) * i) / steps,
      });
  };
  const corner = (cx: number, cy: number, angle: number) => {
    for (let i = 1; i <= 10; i++) {
      const a = angle + (i * Math.PI) / 20;
      const power = (v: number) => Math.sign(v) * Math.abs(v) ** (2 / exponent);
      points.push({ x: cx + r * power(Math.cos(a)), y: cy + r * power(Math.sin(a)) });
    }
  };
  line(width - r, 0);
  corner(width - r, r, -Math.PI / 2);
  line(width, height - r);
  corner(width - r, height - r, 0);
  line(r, height);
  corner(r, height - r, Math.PI / 2);
  line(0, r);
  corner(r, r, Math.PI);
  points.pop();
  return points;
}

/** Closed interpolating contour for expanding surfaces. */
export function flowPath(points: FlowPoint[]): string {
  if (!points.length) return '';
  const n = points.length,
    f = (value: number) => value.toFixed(2);
  let path = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - 1) % n],
      b = points[i],
      c = points[(i + 1) % n],
      d = points[(i + 2) % n];
    path += `C${f(b.x + (c.x - a.x) / 6)} ${f(b.y + (c.y - a.y) / 6)} ${f(c.x - (d.x - b.x) / 6)} ${f(c.y - (d.y - b.y) / 6)} ${f(c.x)} ${f(c.y)}`;
  }
  return `${path}Z`;
}

/** The source pill grows into a clean continuous-corner surface without decorative lobes. */
export function expansionOutline(
  width: number,
  height: number,
  triggerHeight: number,
): FlowPoint[] {
  const expanded = clamp((height - triggerHeight) / 120, 0, 1);
  const radius = triggerHeight / 2 + (36 - triggerHeight / 2) * expanded;
  return flowOutline(width, height, radius, 2 + (FLOW_CORNER_EXPONENT - 2) * expanded);
}
