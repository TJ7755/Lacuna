import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { writeMotionSpeed } from '../../state/motionSpeed';
import { ProgressBar } from './ProgressBar';

const motionProps = vi.hoisted(() => ({ transition: {} as Record<string, unknown> }));
vi.mock('motion/react', () => ({
  m: {
    div: ({
      transition,
      className,
    }: {
      transition: Record<string, unknown>;
      className: string;
    }) => {
      motionProps.transition = transition;
      return createElement('div', { className });
    },
  },
}));

afterEach(() => {
  writeMotionSpeed('normal');
  vi.restoreAllMocks();
});

describe('ProgressBar motion preferences', () => {
  it('retimes its spring when the speed changes while mounted', () => {
    writeMotionSpeed('normal');
    render(<ProgressBar value={0.5} />);
    const normal = motionProps.transition;
    act(() => writeMotionSpeed('slow'));
    expect(motionProps.transition.stiffness).toBeCloseTo(Number(normal.stiffness) / 1.4 ** 2);
    expect(motionProps.transition.damping).toBeCloseTo(Number(normal.damping) / 1.4);
    act(() => writeMotionSpeed('fast'));
    expect(motionProps.transition.stiffness).toBeCloseTo(Number(normal.stiffness) / 0.6 ** 2);
  });

  it('sets progress immediately when reduced motion is requested', () => {
    const matchMedia = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const media = matchMedia(query);
      if (query === '(prefers-reduced-motion: reduce)') {
        Object.defineProperty(media, 'matches', { value: true });
      }
      return media;
    });
    render(<ProgressBar value={0.5} />);
    expect(motionProps.transition).toEqual({ duration: 0 });
  });
});
