import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import type { PathNode } from '../../course/path';
import { CoursePathDrawing } from './CoursePathDrawing';

it('draws the lamp shade, arm and base as one connected outline', async () => {
  const node: PathNode = {
    id: 'lesson',
    nodeType: 'lesson',
    status: 'available',
    lesson: {
      id: 'lesson',
      courseId: 'course',
      name: 'Lesson',
      orderIndex: 4,
      isExtension: false,
      createdAt: 1,
      updatedAt: 1,
    },
  };
  const svg = renderToStaticMarkup(<CoursePathDrawing node={node} index={4} />);
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(640, 560)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => y * info.width + x;
  const opaque = (index: number) => data[index * info.channels + 3] > 127;
  // Flood the rendered arm; both the shade and the foot must be reachable
  // through visible ink, without relying on an exact SVG path string.
  const start = pixel(48 * 4, 55 * 4);
  expect(opaque(start)).toBe(true);
  const connected = new Set([start]);
  const pending = [start];
  while (pending.length) {
    const current = pending.pop()!;
    const x = current % info.width;
    const y = Math.floor(current / info.width);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const next = pixel(nx, ny);
      if (
        nx >= 0 &&
        nx < info.width &&
        ny >= 0 &&
        ny < info.height &&
        !connected.has(next) &&
        opaque(next)
      ) {
        connected.add(next);
        pending.push(next);
      }
    }
  }
  expect(connected.has(pixel(63 * 4, 17 * 4)), 'shade joins the arm').toBe(true);
  expect(connected.has(pixel(31 * 4, 99 * 4)), 'base joins the arm').toBe(true);
});
