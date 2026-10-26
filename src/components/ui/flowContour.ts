export interface FlowPoint {
  x: number;
  y: number;
}
export interface FlowFeedback {
  pressure: number;
  x: number;
}

const bell = (value: number, centre: number, width: number) =>
  Math.exp(-(((value - centre) / width) ** 2));
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Sample superelliptic corners, including straight-edge points for local deformation. */
export function flowOutline(
  width: number,
  height: number,
  radius: number,
  exponent = 4,
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

/** Local edge displacement is bounded in pixels, independent of the control's length. */
export function deformFlow(
  points: FlowPoint[],
  width: number,
  height: number,
  feedback: FlowFeedback,
  feedbackHeight = height,
): FlowPoint[] {
  const centre = clamp(feedback.x, 12, Math.max(12, width - 12));
  return points.map((point, i) => {
    const before = points[(i + points.length - 1) % points.length];
    const after = points[(i + 1) % points.length];
    const dx = after.x - before.x,
      dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = dy / length,
      ny = -dx / length;
    // Two shoulders gather around a pressed-in waist, rather than scaling a slab.
    const top =
      2.8 * bell(point.x, centre - 16, 11) +
      3.2 * bell(point.x, centre + 16, 11) -
      4.1 * bell(point.x, centre, 9);
    const bottom = 2.5 * bell(point.x, centre + 5, 18) - 1.8 * bell(point.x, centre - 23, 12);
    const side = 1.8 * bell(point.y, feedbackHeight / 2, 12);
    const displacement = clamp(
      feedback.pressure *
        (Math.max(0, -ny) * top * bell(point.y, 0, 14) +
          Math.max(0, ny) * bottom * bell(point.y, feedbackHeight, 14) +
          Math.abs(nx) * side),
      -3.5,
      3.5,
    );
    return { x: point.x + nx * displacement, y: point.y + ny * displacement };
  });
}

/** Closed interpolating contour: shared by local feedback and expanding surfaces. */
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

/** Keep source and body joined while the measured shell grows or contracts. */
export function expansionOutline(
  width: number,
  height: number,
  triggerWidth: number,
  triggerHeight: number,
  align: 'start' | 'end',
): FlowPoint[] {
  const expanded = clamp((height - triggerHeight) / 120, 0, 1);
  const radius = triggerHeight / 2 + (24 - triggerHeight / 2) * expanded;
  const points = flowOutline(width, height, radius, 2 + 2 * expanded);
  const neck =
    clamp((width - triggerWidth) / 70, 0, 1) * clamp(1 - (height - triggerHeight) / 160, 0, 1);
  return points.map(({ x, y }) => {
    const fromSource = align === 'end' ? width - triggerWidth - x : x - triggerWidth;
    const body = clamp((fromSource + 20) / 44, 0, 1);
    const top = 16 * neck * body * bell(y, 0, triggerHeight * 0.6);
    const sourceSide = align === 'end' ? bell(x, width, 10) : bell(x, 0, 10);
    const waist = 8 * neck * sourceSide * bell(y, triggerHeight + 6, 15);
    return { x: x + (align === 'end' ? -waist : waist), y: y + top };
  });
}
