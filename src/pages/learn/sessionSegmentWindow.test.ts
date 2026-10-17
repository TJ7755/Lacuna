import { describe, expect, it } from 'vitest';
import { sessionSegmentWindow } from './sessionSegmentWindow';

describe('sessionSegmentWindow', () => {
  it('leaves sessions that fit on their original full-width strip', () => {
    expect(sessionSegmentWindow(6, 5, 156)).toMatchObject({ size: 6, start: 0 });
    expect(sessionSegmentWindow(8, 7, 156)).toMatchObject({ size: 8, start: 0 });
  });

  it('sizes the window from its available width without shrinking pills below 16px', () => {
    expect(sessionSegmentWindow(322, 0, 156)).toEqual({ size: 8, start: 0, segmentWidth: 16 });
    expect(sessionSegmentWindow(322, 0, 796)).toEqual({ size: 40, start: 0, segmentWidth: 16 });
    expect(sessionSegmentWindow(322, 0, 170).segmentWidth).toBeGreaterThan(16);
  });

  it('holds still until 80%, then moves the current card back to 20%', () => {
    expect(sessionSegmentWindow(322, 31, 796).start).toBe(0);
    expect(sessionSegmentWindow(322, 32, 796).start).toBe(24);
    expect(sessionSegmentWindow(322, 55, 796).start).toBe(24);
    expect(sessionSegmentWindow(322, 56, 796).start).toBe(48);
  });

  it('reverses across boundaries and handles arbitrary jumps and retries', () => {
    const starts = [0, 31, 32, 33, 32, 31, 280, 4].map(
      (index) => sessionSegmentWindow(322, index, 796).start,
    );
    expect(starts).toEqual([0, 0, 24, 24, 24, 0, 264, 0]);
  });

  it('keeps the final window filled and clamps out-of-range indices', () => {
    expect(sessionSegmentWindow(322, 321, 796).start).toBe(282);
    expect(sessionSegmentWindow(322, 500, 796).start).toBe(282);
    expect(sessionSegmentWindow(322, -1, 796).start).toBe(0);
  });

  it('keeps the current card inside the window at every index, including narrow layouts', () => {
    for (const width of [40, 116, 156, 170, 796]) {
      for (let index = 0; index < 322; index += 1) {
        const window = sessionSegmentWindow(322, index, width);
        expect(window.segmentWidth).toBeGreaterThanOrEqual(16);
        expect(index).toBeGreaterThanOrEqual(window.start);
        expect(index).toBeLessThan(window.start + window.size);
        expect(window.start + window.size).toBeLessThanOrEqual(322);
      }
    }
  });

  it('handles empty sessions and the first render before measurement', () => {
    expect(sessionSegmentWindow(0, -1, 156)).toMatchObject({ size: 0, start: 0 });
    expect(sessionSegmentWindow(322, 100, 0)).toMatchObject({ size: 322, start: 0 });
  });
});
