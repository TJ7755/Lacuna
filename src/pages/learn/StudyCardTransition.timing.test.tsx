import { createRef } from 'react';
import { animate } from 'motion/react';
import type * as MotionReact from 'motion/react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudyCardTransition, type StudyCardTransitionHandle } from './StudyCardTransition';

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>();
  return { ...actual, animate: vi.fn() };
});

const animateMock = vi.mocked(animate);

function completeLatestAnimation() {
  const options = animateMock.mock.calls.at(-1)?.[2];
  if (typeof options === 'object' && 'onComplete' in options) options.onComplete?.();
}

describe('StudyCardTransition timing', () => {
  it('uses a calmer entrance', () => {
    animateMock.mockClear();
    const view = render(
      <StudyCardTransition cardId="one" phase="question" multiplier={1}>
        Card
      </StudyCardTransition>,
    );

    expect(animateMock.mock.calls.some((call) => call[2]?.duration === 0.36)).toBe(true);
    view.unmount();
  });

  it('finishes departure, pauses, then commits once', () => {
    vi.useFakeTimers();
    animateMock.mockClear();
    const ref = createRef<StudyCardTransitionHandle>();
    const commit = vi.fn();
    const view = render(
      <StudyCardTransition ref={ref} cardId="one" phase="answer" multiplier={1}>
        Card
      </StudyCardTransition>,
    );

    act(() => {
      ref.current!.dismiss(true, commit);
      ref.current!.dismiss(false, commit);
    });
    expect(animateMock.mock.calls.at(-1)?.[2]?.duration).toBe(0.2);
    void act(completeLatestAnimation);
    void act(() => vi.advanceTimersByTime(179));
    expect(commit).not.toHaveBeenCalled();
    void act(() => vi.advanceTimersByTime(1));
    expect(commit).toHaveBeenCalledOnce();
    view.unmount();
    vi.useRealTimers();
  });

  it.each([0.6, 1, 1.4])(
    'finishes the edge pulse before committing at motion multiplier %s',
    (multiplier) => {
      vi.useFakeTimers();
      animateMock.mockClear();
      const ref = createRef<StudyCardTransitionHandle>();
      const commit = vi.fn();
      const view = render(
        <StudyCardTransition ref={ref} cardId="one" phase="answer" multiplier={multiplier}>
          Card
        </StudyCardTransition>,
      );

      act(() => ref.current!.dismiss(true, commit));
      const feedback = view.container.querySelector('[data-study-feedback]');
      expect(feedback).not.toBeNull();
      expect(feedback).toHaveAttribute('data-study-feedback', 'right');
      expect(feedback!.querySelector('.rounded-full')).toBeNull();
      const pulse = animateMock.mock.calls.find((call) => Array.isArray(call[1]));
      expect(pulse?.[1]).toEqual([0, 1, 0]);
      expect(pulse?.[2]?.duration).toBe(0.32 * multiplier);
      void act(completeLatestAnimation);
      void act(() => vi.advanceTimersByTime(180 * multiplier));
      expect(commit).toHaveBeenCalledOnce();
      expect(view.container.querySelector('[data-study-feedback]')).toBeNull();
      view.unmount();
      vi.useRealTimers();
    },
  );

  it('cancels a pending grade when the answer is hidden during the pause', () => {
    vi.useFakeTimers();
    animateMock.mockClear();
    const ref = createRef<StudyCardTransitionHandle>();
    const commit = vi.fn();
    const view = render(
      <StudyCardTransition ref={ref} cardId="one" phase="answer" multiplier={1}>
        Card
      </StudyCardTransition>,
    );

    act(() => ref.current!.dismiss(false, commit));
    void act(completeLatestAnimation);
    view.rerender(
      <StudyCardTransition ref={ref} cardId="one" phase="question" multiplier={1}>
        Card
      </StudyCardTransition>,
    );
    void act(() => vi.advanceTimersByTime(500));
    expect(commit).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-study-feedback]')).toBeNull();
    view.unmount();
    vi.useRealTimers();
  });

  it('cancels a pending grade when unmounted during the inter-card pause', () => {
    vi.useFakeTimers();
    animateMock.mockClear();
    const ref = createRef<StudyCardTransitionHandle>();
    const commit = vi.fn();
    const view = render(
      <StudyCardTransition ref={ref} cardId="one" phase="answer" multiplier={1}>
        Card
      </StudyCardTransition>,
    );

    act(() => ref.current!.dismiss(false, commit));
    void act(completeLatestAnimation);
    view.unmount();
    void act(() => vi.advanceTimersByTime(500));
    expect(commit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
