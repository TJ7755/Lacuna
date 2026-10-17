import { describe, expect, it } from 'vitest';
import { morphFrame, morphTiming, morphKeyframes, morphProgress } from './morphReveal';

const origin = { left: 300, top: 20, width: 120, height: 44 };
const panel = { left: 0, top: 0, width: 448, height: 360 };

describe('expanding action morph', () => {
  it('keeps a short reveal a true pill and settles at a 24px panel corner', () => {
    const closed = morphFrame(origin, panel, 0, 0);
    expect(closed.radius).toBe(22);
    const short = morphFrame(origin, panel, 0.5, 0.002);
    expect(short.radius).toBeCloseTo(short.height / 2);
    expect(morphFrame(origin, panel, 1, 1).radius).toBe(24);
    expect(morphFrame(origin, panel, 1, 1).clipPath).toBe('inset(0px 0px 0px 0px round 24px)');
  });

  it('leads with width on opening and height on closing, with a motion-scaled 35ms lag', () => {
    expect(morphTiming(true, 1)).toMatchObject({ xDelay: 0, yDelay: 35 });
    expect(morphTiming(false, 1)).toMatchObject({ xDelay: 35, yDelay: 0 });
    expect(morphTiming(true, 1.4).yDelay).toBe(49);
    const open = morphKeyframes(origin, panel, true, 1);
    const early = open.frames.find((frame) => frame.offset! >= 0.03)!;
    expect(early.clipPath).not.toBe(open.frames[0].clipPath);
    expect(open.frames.at(-1)?.clipPath).toBe('inset(0px 0px 0px 0px round 24px)');
    expect(
      open.frames.every(
        (frame) =>
          !('width' in frame) && !('height' in frame) && !('left' in frame) && !('top' in frame),
      ),
    ).toBe(true);
  });

  it('reaches the closing pill within a pixel before the final sample', () => {
    const near = morphFrame(origin, panel, 1 - morphProgress(255, false, 'x'), 1 - morphProgress(290, false, 'y'));
    expect(near.width - origin.width).toBeLessThan(1);
    expect(near.height - origin.height).toBeLessThan(1);
  });

  it.each([true, false])(
    'applies the exact endpoint immediately at multiplier zero (open=%s)',
    (open) => {
      const result = morphKeyframes(origin, panel, open, 0);
      expect(result.duration).toBe(0);
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].clipPath).toBe(morphFrame(origin, panel, +open, +open).clipPath);
    },
  );
});
