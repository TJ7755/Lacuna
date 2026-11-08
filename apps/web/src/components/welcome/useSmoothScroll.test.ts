import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useSmoothScroll } from './useSmoothScroll';

function wheelPosition(
  deliver: (wheel: FrameRequestCallback, paint: FrameRequestCallback) => void,
) {
  const frames: FrameRequestCallback[] = [];
  let position = 0;
  const clock = vi.spyOn(performance, 'now');
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(10_000);
  vi.spyOn(window, 'scrollTo').mockImplementation((options: number | ScrollToOptions) => {
    if (typeof options === 'object') position = options.top ?? position;
  });
  const { unmount } = renderHook(() => useSmoothScroll(true));
  try {
    deliver(
      (timestamp) => {
        clock.mockReturnValue(timestamp);
        window.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, cancelable: true }));
      },
      (timestamp) => frames.shift()?.(timestamp),
    );
    return position;
  } finally {
    unmount();
    vi.restoreAllMocks();
  }
}

it('keeps the deliberate wheel glide over elapsed time when frames are missed', () => {
  const sample = (refreshRate: number) =>
    wheelPosition((wheel, paint) => {
      wheel(0);
      // Align the first paint, then deliver different numbers of frames over the same interval.
      for (let frame = 0; frame <= refreshRate * 0.4; frame++) {
        paint((frame * 1000) / refreshRate);
      }
    });
  const reference = sample(60);
  expect(reference).toBeGreaterThan(600);
  expect(reference).toBeLessThan(640);
  for (const refreshRate of [30, 120]) {
    expect(sample(refreshRate)).toBeCloseTo(reference, 5);
  }
});

it('does not fast-forward new wheel input when a frame arrives late', () => {
  const sample = (secondTick: boolean) =>
    wheelPosition((wheel, paint) => {
      wheel(0);
      paint(0);
      if (secondTick) wheel(250);
      paint(250);
    });
  expect(sample(true)).toBeCloseTo(sample(false), 5);
});
