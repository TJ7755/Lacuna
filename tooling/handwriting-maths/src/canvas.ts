/** Pointer capture on a canvas. The only DOM-aware module in the recognition path. */

import { splitStrokes, type Point } from './strokes';

export interface CanvasCapture {
  /** Every point captured since the last clear, across all strokes. */
  points(): Point[];
  strokeCount(): number;
  clear(): void;
  /** Remove the most recent stroke. Counted as a correction by the trial harness. */
  undo(): void;
  /** Called after each pen-up. */
  onStrokeEnd(handler: () => void): void;
}

export const attachCapture = (canvas: HTMLCanvasElement): CanvasCapture => {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');

  let points: Point[] = [];
  let strokeId = 0;
  let drawing = false;
  const handlers: Array<() => void> = [];

  /** Repaint from the retained points rather than drawing incrementally: resizing the
   *  canvas clears it, and incremental drawing would lose the ink already on screen. */
  const paint = () => {
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#111';
    context.fillStyle = '#111';
    for (const stroke of splitStrokes(points)) {
      // A tap is a one-point stroke, and a path with only a moveTo paints nothing.
      // Decimal points are taps, so they get a filled circle rather than a stroked path.
      if (stroke.length === 1) {
        context.beginPath();
        context.arc(stroke[0].x, stroke[0].y, context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.beginPath();
      stroke.forEach((point, index) =>
        index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y),
      );
      context.stroke();
    }
  };

  /** A canvas inside a hidden container measures 0x0, which would leave the backing
   *  store zero-sized and silently discard every stroke drawn once it became visible.
   *  ResizeObserver ties sizing to visibility rather than to load order. */
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Back the canvas at device resolution so finger strokes are not resampled from a
    // blurry low-resolution trail.
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    // Assigning width or height clears the canvas, so only do it on a real change.
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    paint();
  };

  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  const positionOf = (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, strokeId };
  };

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawing = true;
    points.push(positionOf(event));
    paint();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    event.preventDefault();
    points.push(positionOf(event));
    paint();
  });

  const endStroke = (event: PointerEvent) => {
    if (!drawing) return;
    event.preventDefault();
    drawing = false;
    strokeId += 1;
    for (const handler of handlers) handler();
  };

  // No pointerleave handler: with pointer capture it can still fire as a finger crosses
  // the element bounds, chopping one stroke into several and corrupting the stroke
  // count the recogniser depends on.
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  return {
    points: () => points.slice(),
    strokeCount: () => splitStrokes(points).length,
    clear: () => {
      points = [];
      strokeId = 0;
      paint();
    },
    undo: () => {
      const strokes = splitStrokes(points);
      strokes.pop();
      points = strokes.flat();
      strokeId = strokes.length;
      paint();
    },
    onStrokeEnd: (handler) => {
      handlers.push(handler);
    },
  };
};
