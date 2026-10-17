import { createRef } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudyCardTransition, type StudyCardTransitionHandle } from './StudyCardTransition';

beforeEach(() => {
  const nativeAnimate = Element.prototype.animate;
  vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element, ...args) {
    const animation = nativeAnimate.apply(this, args);
    // happy-dom rejects native animation promises on cancellation; consume those
    // while retaining real Motion/presence timing for the lifecycle regressions.
    void animation.finished.catch(() => {});
    return animation;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup(multiplier = 1) {
  const ref = createRef<StudyCardTransitionHandle>();
  const frame = (id: string, phase: 'question' | 'answer') => (
    <LazyMotion features={domAnimation}>
      <StudyCardTransition ref={ref} cardId={id} phase={phase} multiplier={multiplier}>
        <div>
          {id} {phase}
        </div>
      </StudyCardTransition>
    </LazyMotion>
  );
  const view = render(frame('one', 'answer'));
  return { ref, view, frame };
}

describe('StudyCardTransition hand-off', () => {
  it.each([0.6, 1, 1.4])('commits during departure at multiplier %s, without a page pulse', (m) => {
    vi.useFakeTimers();
    const { ref, view } = setup(m);
    const commit = vi.fn();
    void act(() => {
      ref.current!.dismiss(true, commit);
      ref.current!.dismiss(false, commit);
    });
    expect(view.container.querySelector('[data-study-feedback]')).toBeNull();
    expect(view.container.querySelector('[data-study-rim="positive"]')).not.toBeNull();
    void act(() => vi.advanceTimersByTime(80 * m));
    expect(commit).toHaveBeenCalledOnce();
    void act(() => vi.advanceTimersByTime(1000));
    expect(commit).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('retains the departing card while the persisted next card enters', () => {
    vi.useFakeTimers();
    const { ref, view, frame } = setup();
    void act(() => ref.current!.dismiss(true, vi.fn()));
    void act(() => vi.advanceTimersByTime(80));
    view.rerender(frame('two', 'question'));
    expect(view.getByText('one answer')).toBeInTheDocument();
    expect(view.getByText('two question')).toBeInTheDocument();
    expect(view.getByText('one answer').closest('[data-study-card-id]')).toHaveAttribute('inert');
    view.unmount();
  });

  it('animates repeated ids as distinct presentations', () => {
    vi.useFakeTimers();
    const { ref, view, frame } = setup();
    const commit = vi.fn();
    void act(() => ref.current!.dismiss(false, commit));
    void act(() => vi.advanceTimersByTime(80));
    view.rerender(frame('one', 'question'));
    expect(view.getByText('one answer')).toBeInTheDocument();
    expect(view.getByText('one question')).toBeInTheDocument();
    view.rerender(frame('one', 'answer'));
    void act(() => ref.current!.dismiss(true, commit));
    void act(() => vi.advanceTimersByTime(80));
    expect(commit).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('cancels an uncommitted grade and clears the rim on Undo', () => {
    vi.useFakeTimers();
    const { ref, view } = setup();
    const commit = vi.fn();
    void act(() => ref.current!.dismiss(false, commit));
    void act(() => ref.current!.cancel());
    void act(() => vi.advanceTimersByTime(1000));
    expect(commit).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-study-rim]')).toBeNull();
    view.unmount();
  });

  it('commits synchronously and only once without motion', () => {
    const { ref, view } = setup(0);
    const commit = vi.fn();
    void act(() => {
      expect(ref.current!.dismiss(false, commit)).toBe(true);
      expect(commit).toHaveBeenCalledOnce();
      expect(ref.current!.dismiss(false, commit)).toBe(false);
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[data-study-rim]')).toBeNull();
    view.unmount();
  });

  it('removes the settled transform so fixed descendants remain viewport-bound', async () => {
    const { view } = setup();
    await waitFor(() =>
      expect(view.container.querySelector('[data-study-card-id]')).toHaveStyle({
        transform: 'none',
      }),
    );
    view.unmount();
  });
});

it('keeps the active element after the retained outgoing element unmounts', async () => {
  const { ref, view, frame } = setup();
  const first = vi.fn();
  void act(() => ref.current!.dismiss(false, first));
  await waitFor(() => expect(first).toHaveBeenCalledOnce());
  view.rerender(frame('two', 'question'));
  await waitFor(() => expect(view.queryByText('one answer')).not.toBeInTheDocument());
  view.rerender(frame('two', 'answer'));
  const second = vi.fn();
  void act(() => ref.current!.dismiss(true, second));
  expect(second).not.toHaveBeenCalled();
  expect(view.container.querySelector('[data-study-rim="positive"]')).not.toBeNull();
  await waitFor(() => expect(second).toHaveBeenCalledOnce());
  view.unmount();
});

it('starts the exit before persistence supplies its replacement', async () => {
  const { ref, view, frame } = setup();
  const commit = vi.fn();
  void act(() => ref.current!.dismiss(true, commit));
  const current = view.container.querySelector('[data-study-card-id]')!;
  await waitFor(() => expect((current as HTMLElement).style.transform).toContain('translateX'));
  await waitFor(() => expect(commit).toHaveBeenCalledOnce());
  await new Promise((resolve) => setTimeout(resolve, 450));
  expect((current as HTMLElement).style.transform).toContain('translateX');
  view.rerender(frame('two', 'question'));
  await waitFor(() => expect(view.queryByText('one answer')).not.toBeInTheDocument());
  expect(view.getByText('two question')).toBeInTheDocument();
  view.unmount();
});
