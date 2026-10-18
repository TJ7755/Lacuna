import { createRef } from 'react';
import { LazyMotion, domAnimation, frame, type MotionValue } from 'motion/react';
import type * as MotionReact from 'motion/react';
import { act, render } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudyCardTransition, type StudyCardTransitionHandle } from './StudyCardTransition';

const flights = vi.hoisted(
  () =>
    [] as {
      x: MotionValue<number>;
      target: number;
      finish: () => void;
      stop: ReturnType<typeof vi.fn>;
    }[],
);

const frames = vi.hoisted(() => {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    callbacks.push(callback),
  );
  return callbacks;
});

function renderFrame() {
  act(() => {
    for (const callback of frames.splice(0)) callback(performance.now());
  });
}

vi.mock('motion/react', async (importOriginal) => {
  const motion = await importOriginal<typeof MotionReact>();
  return {
    ...motion,
    animate: (x: MotionValue<number>, target: number | number[]) => {
      let finish!: () => void;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const stop = vi.fn();
      if (typeof target === 'number') flights.push({ x, target, finish, stop });
      return Object.assign(finished, { stop });
    },
  };
});

beforeEach(() => {
  flights.length = 0;
  const nativeAnimate = Element.prototype.animate;
  vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element, ...args) {
    const animation = nativeAnimate.apply(this, args);
    void animation.finished.catch(() => {});
    return animation;
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

function setup() {
  const ref = createRef<StudyCardTransitionHandle>();
  const card = (id: string) => (
    <LazyMotion features={domAnimation}>
      <StudyCardTransition ref={ref} cardId={id} phase="answer" multiplier={1}>
        {id}
      </StudyCardTransition>
    </LazyMotion>
  );
  const view = render(card('one'));
  act(() => {
    ref.current!.dismiss(true, vi.fn());
  });
  return { ref, view, card, flight: flights[0] };
}

describe('StudyCardTransition rendered departure', () => {
  it.each([false, true])(
    'renders the final position before removal (late hand-off: %s)',
    async (late) => {
      const { view, card, flight } = setup();
      const outgoing = view.getByText('one');
      if (!late) view.rerender(card('two'));
      await act(async () => {
        flight.x.set(flight.target);
        flight.finish();
      });
      expect(outgoing).toBeInTheDocument();

      let rendered: { connected: boolean; transform: string } | undefined;
      frame.render(() => {
        rendered = { connected: outgoing.isConnected, transform: outgoing.style.transform };
      });
      if (late)
        await act(async () => {
          view.rerender(card('two'));
        });
      renderFrame();
      expect(rendered).toBeDefined();
      expect(rendered!.connected).toBe(true);
      expect(rendered!.transform).toContain(`translateX(${flight.target}px)`);
      expect(outgoing).not.toBeInTheDocument();
      expect(view.getByText('two')).toBeInTheDocument();
      expect(flights).toHaveLength(1);
      view.unmount();
    },
  );

  it.each([
    { cancel: 'undo', completed: false },
    { cancel: 'undo', completed: true },
    { cancel: 'unmount', completed: false },
    { cancel: 'unmount', completed: true },
  ])('cancels departure on $cancel (completed: $completed)', async ({ cancel, completed }) => {
    const { ref, view, card, flight } = setup();
    view.rerender(card('two'));
    if (completed)
      await act(async () => {
        flight.x.set(flight.target);
        flight.finish();
      });
    act(() => {
      if (cancel === 'undo') ref.current!.cancel();
      else view.unmount();
    });
    if (!completed)
      await act(async () => {
        flight.finish();
      });
    renderFrame();
    expect(flight.stop).toHaveBeenCalledOnce();
    if (cancel === 'undo') {
      expect(view.getByText('two')).toBeInTheDocument();
      expect(view.queryByText('one')).toBeNull();
      view.unmount();
    }
  });
});
