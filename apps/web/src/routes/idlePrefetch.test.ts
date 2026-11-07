import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { scheduleBackgroundWork } from './idlePrefetch';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('waits for five quiet seconds, then runs the startup task once', () => {
  const work = vi.fn();
  const cancel = scheduleBackgroundWork(work);
  vi.advanceTimersByTime(4_999);
  expect(work).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(work).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('keydown'));
  vi.advanceTimersByTime(60_000);
  expect(work).toHaveBeenCalledOnce();
  cancel();
});

it('gives typing, pointer input and scrolling another quiet window without starving maintenance', () => {
  const work = vi.fn();
  const cancel = scheduleBackgroundWork(work);
  for (let second = 1; second <= 29; second++) {
    vi.advanceTimersByTime(1_000);
    window.dispatchEvent(new Event(['keydown', 'pointerdown', 'wheel'][second % 3]));
    expect(work).not.toHaveBeenCalled();
  }
  vi.advanceTimersByTime(1_000);
  expect(work).toHaveBeenCalledOnce();
  cancel();
});

it('postpones for input and removes every timer/listener when its owner leaves', () => {
  const work = vi.fn();
  const remove = vi.spyOn(window, 'removeEventListener');
  const cancel = scheduleBackgroundWork(work);
  vi.advanceTimersByTime(4_000);
  window.dispatchEvent(new Event('keydown'));
  vi.advanceTimersByTime(4_000);
  expect(work).not.toHaveBeenCalled();
  cancel();
  vi.advanceTimersByTime(60_000);
  expect(work).not.toHaveBeenCalled();
  expect(remove.mock.calls.map(([event]) => event)).toEqual(
    expect.arrayContaining(['keydown', 'pointerdown', 'wheel']),
  );
  remove.mockRestore();
});
