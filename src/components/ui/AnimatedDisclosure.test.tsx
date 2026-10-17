import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnimatedDisclosure, animatedDisclosureTiming } from './AnimatedDisclosure';
import { scaledSpring } from './motion';
import { domAnimation, LazyMotion } from 'motion/react';
import { spring } from 'motion';

const motion = vi.hoisted(() => ({ multiplier: 1 }));

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => motion.multiplier,
}));

describe('animatedDisclosureTiming', () => {
  it.each([0.6, 1, 1.4])('closes without crossing zero at speed %s', (multiplier) => {
    for (const height of [400, 1600, 4000]) {
      const generator = spring({
        ...animatedDisclosureTiming(multiplier).height,
        keyframes: [height, 0],
      });
      let previous = height;
      for (let time = 0; time <= 1500 * multiplier; time += 1000 / 60) {
        const frame = generator.next(time);
        // Negative CSS heights are rejected, leaving the last positive sliver frozen.
        expect(frame.value).toBeGreaterThanOrEqual(0);
        expect(frame.value).toBeLessThanOrEqual(previous);
        previous = frame.value;
        if (frame.done) break;
      }
      expect(previous).toBe(0);
    }
  });

  it('follows the global speed and reduced-motion multipliers', () => {
    expect(animatedDisclosureTiming(1.4).height).toEqual(
      scaledSpring(1.4, 420, 2 * Math.sqrt(420)),
    );
    expect(animatedDisclosureTiming(1.4).opacity.duration).toBeCloseTo(0.168);
    expect(animatedDisclosureTiming(0.6).height).toEqual(
      scaledSpring(0.6, 420, 2 * Math.sqrt(420)),
    );
    expect(animatedDisclosureTiming(0.6).opacity.duration).toBeCloseTo(0.072);
    expect(animatedDisclosureTiming(0)).toEqual({
      height: { duration: 0 },
      opacity: { duration: 0 },
    });
  });
});

describe('AnimatedDisclosure', () => {
  it('leaves opacity to the children when a retained disclosure disables its fade', async () => {
    motion.multiplier = 0;
    try {
      const view = (open: boolean) => (
        <LazyMotion features={domAnimation}>
          <AnimatedDisclosure id="lessons" open={open} retainContent fade={false}>
            <p>Individually animated rows</p>
          </AnimatedDisclosure>
        </LazyMotion>
      );
      const { rerender } = render(view(true));
      const panel = document.getElementById('lessons')!;
      rerender(view(false));
      await waitFor(() => expect(panel.style.height).toBe('0px'));
      expect(panel.style.opacity).toBe('1');
      expect(panel).toHaveAttribute('inert');
      rerender(view(true));
      expect(panel.style.opacity).toBe('1');
    } finally {
      motion.multiplier = 1;
    }
  });

  it('caches retained height between toggles and updates it when closed content resizes', async () => {
    let measuredHeight = 120;
    let resize = () => {};
    const measure = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => ({ height: measuredHeight }) as DOMRect);
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    motion.multiplier = 0;
    try {
      const view = (open: boolean) => (
        <LazyMotion features={domAnimation}>
          <AnimatedDisclosure open={open} retainContent>
            <p>Measured body</p>
          </AnimatedDisclosure>
        </LazyMotion>
      );
      const { rerender, unmount } = render(view(true));
      const panel = screen.getByText('Measured body').parentElement!.parentElement!;
      await waitFor(() => expect(panel.style.height).toBe('120px'));
      measure.mockClear();
      rerender(view(false));
      await waitFor(() => expect(panel.style.height).toBe('0px'));
      rerender(view(true));
      await waitFor(() => expect(panel.style.height).toBe('120px'));
      expect(measure).not.toHaveBeenCalled();
      rerender(view(false));
      measuredHeight = 240;
      act(() => resize());
      rerender(view(true));
      await waitFor(() => expect(panel.style.height).toBe('240px'));
      unmount();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      motion.multiplier = 1;
      measure.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('makes departing controls inert immediately and revives them when reopened during exit', async () => {
    const view = (open: boolean) => (
      <LazyMotion features={domAnimation}>
        <AnimatedDisclosure open={open}>
          <button type="button">Optional action</button>
        </AnimatedDisclosure>
      </LazyMotion>
    );
    const { rerender } = render(view(true));
    const control = screen.getByRole('button', { name: 'Optional action' });
    rerender(view(false));
    expect(control).toBeInTheDocument();
    expect(control.closest('[inert]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Optional action' })).not.toBeInTheDocument();
    rerender(view(true));
    expect(screen.getByRole('button', { name: 'Optional action' })).toBe(control);
    expect(control.closest('[inert]')).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
  });
  it('retains a closed form draft while making its controls inert', () => {
    const view = (open: boolean) => (
      <LazyMotion features={domAnimation}>
        <AnimatedDisclosure open={open} retainContent>
          <input aria-label="Draft" defaultValue="Original" />
        </AnimatedDisclosure>
      </LazyMotion>
    );
    const { rerender } = render(view(false));
    expect(screen.getByLabelText('Draft')).toBeInTheDocument();
    rerender(view(true));
    const input = screen.getByRole('textbox', { name: 'Draft' });
    fireEvent.input(input, { target: { value: 'Uncommitted' } });
    rerender(view(false));
    expect(input.closest('[inert]')).not.toBeNull();
    rerender(view(true));
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
    expect(input).toHaveValue('Uncommitted');
  });
  it('renders content only while it is open', () => {
    const { rerender } = render(
      <AnimatedDisclosure open={false}>
        <p>Optional controls</p>
      </AnimatedDisclosure>,
    );
    expect(screen.queryByText('Optional controls')).not.toBeInTheDocument();

    rerender(
      <AnimatedDisclosure open>
        <p>Optional controls</p>
      </AnimatedDisclosure>,
    );
    expect(screen.getByText('Optional controls')).toBeInTheDocument();
  });
});
