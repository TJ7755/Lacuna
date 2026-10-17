import { describe, expect, it } from 'vitest';
import { sessionSegmentWindow } from './sessionSegmentWindow';

describe('sessionSegmentWindow', () => {
  it('shows about 17 wider pills on desktop and tablet strips', () => {
    for (const width of [360, 440, 824, 1200]) {
      const window = sessionSegmentWindow(322, 0, width);
      expect(window.size).toBeGreaterThanOrEqual(15);
      expect(window.size).toBeLessThanOrEqual(20);
    }
    expect(sessionSegmentWindow(322, 0, 824).size).toBe(17);
  });

  it('leaves sessions that fit on their original full-width strip', () => {
    expect(sessionSegmentWindow(6, 5, 156)).toMatchObject({ size: 6, start: 0 });
    expect(sessionSegmentWindow(8, 7, 156)).toMatchObject({ size: 8, start: 0 });
    expect(sessionSegmentWindow(17, 16, 810)).toMatchObject({ size: 17, start: 0 });
    expect(sessionSegmentWindow(18, 17, 810)).toMatchObject({ size: 17, start: 1 });
    expect(sessionSegmentWindow(9, 8, 156)).toMatchObject({ size: 8, start: 1 });
  });

  it('sizes the window from its available width without shrinking pills below 16px', () => {
    expect(sessionSegmentWindow(322, 0, 156)).toEqual({
      size: 8,
      start: 0,
      segmentWidth: 16,
      gap: 4,
    });
    expect(sessionSegmentWindow(322, 0, 134)).toEqual({
      size: 6,
      start: 0,
      segmentWidth: 19,
      gap: 4,
    });
    expect(sessionSegmentWindow(322, 0, 810)).toEqual({
      size: 17,
      start: 0,
      segmentWidth: 42,
      gap: 6,
    });
    expect(sessionSegmentWindow(322, 0, 170).segmentWidth).toBeGreaterThan(16);
  });

  it('holds still until 80%, then moves the current card back to 20%', () => {
    expect(sessionSegmentWindow(322, 12, 810).start).toBe(0);
    expect(sessionSegmentWindow(322, 13, 810).start).toBe(10);
    expect(sessionSegmentWindow(322, 22, 810).start).toBe(10);
    expect(sessionSegmentWindow(322, 23, 810).start).toBe(20);
  });

  it('reverses across boundaries and handles arbitrary jumps and retries', () => {
    const starts = [0, 12, 13, 14, 13, 12, 280, 4].map(
      (index) => sessionSegmentWindow(322, index, 810).start,
    );
    expect(starts).toEqual([0, 0, 10, 10, 10, 0, 270, 0]);
  });

  it('keeps the final window filled and clamps out-of-range indices', () => {
    expect(sessionSegmentWindow(322, 321, 810).start).toBe(305);
    expect(sessionSegmentWindow(322, 500, 810).start).toBe(305);
    expect(sessionSegmentWindow(322, -1, 810).start).toBe(0);
  });

  it('keeps the current card inside the window at every index, including narrow layouts', () => {
    for (const width of [40, 116, 134, 156, 170, 360, 440, 810, 1200]) {
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
