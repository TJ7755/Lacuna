import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMorphReveal } from './useMorphReveal';

function Preview({ height }: { height: number }) {
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useMorphReveal({
    surface,
    content,
    origin: { left: 300, top: 0, width: 120, height: 48 },
    bounds: { left: 0, top: 0, width: 448, height },
    open: true,
    multiplier: 1,
  });
  return (
    <div ref={surface} data-testid="surface">
      <div ref={content} data-testid="content">
        Session plan
      </div>
    </div>
  );
}
afterEach(() => vi.restoreAllMocks());
it('retargets loaded preview geometry without replaying content or extending the opening', () => {
  const calls: { element: Element; animation: Animation; frames: Keyframe[]; duration: number }[] =
    [];
  vi.spyOn(Element.prototype, 'animate').mockImplementation(function (
    this: Element,
    frames,
    options,
  ) {
    const animation = {
      cancel: vi.fn(),
      finished: new Promise(() => {}),
      currentTime: 0,
    } as unknown as Animation;
    calls.push({
      element: this,
      animation,
      frames: frames as Keyframe[],
      duration: (options as KeyframeAnimationOptions).duration as number,
    });
    return animation;
  });
  const { rerender } = render(<Preview height={200} />);
  const content = screen.getByTestId('content');
  const surface = screen.getByTestId('surface');
  calls.forEach((call) => {
    call.animation.currentTime = 120;
  });
  rerender(<Preview height={348} />);
  expect(calls.filter((call) => call.element === content)).toHaveLength(1);
  const reveals = calls.filter((call) => call.element === surface);
  expect(reveals).toHaveLength(2);
  expect(reveals[1].duration).toBeLessThanOrEqual(reveals[0].duration - 120);
  const before = reveals[0].frames.find((frame) => frame.offset! >= 120 / reveals[0].duration)!;
  const after = reveals[1].frames[0];
  const bottomInset = (frame: Keyframe) =>
    Number(
      String(frame.clipPath)
        .match(/inset\([^ ]+ [^ ]+ ([^ ]+)/)![1]
        .replace('px', ''),
    );
  expect(348 - bottomInset(after)).toBeCloseTo(200 - bottomInset(before), -1);
});
