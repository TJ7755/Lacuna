import { createRef, StrictMode } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudyCardTransition, type StudyCardTransitionHandle } from './StudyCardTransition';

beforeEach(() => {
  const nativeAnimate = Element.prototype.animate;
  vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element, ...args) {
    const animation = nativeAnimate.apply(this, args);
    void animation.finished.catch(() => {});
    return animation;
  });
});
afterEach(() => vi.restoreAllMocks());

describe('StudyCardTransition', () => {
  it('makes the card readable after StrictMode replays its entrance effects', async () => {
    const view = render(
      <StrictMode>
        <LazyMotion features={domAnimation}>
          <StudyCardTransition cardId="one" phase="question" multiplier={1}>
            Readable question
          </StudyCardTransition>
        </LazyMotion>
      </StrictMode>,
    );
    await waitFor(() =>
      expect(view.getByText('Readable question').closest('[data-study-card-id]')).toHaveStyle({
        opacity: '1',
      }),
    );
    view.unmount();
  });

  it('finishes departure before committing and ignores repeated grades', async () => {
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
    expect(commit).not.toHaveBeenCalled();
    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    view.unmount();
  });

  it('cancels a pending grade when the study card unmounts', async () => {
    const ref = createRef<StudyCardTransitionHandle>();
    const commit = vi.fn();
    const view = render(
      <StudyCardTransition ref={ref} cardId="one" phase="answer" multiplier={1}>
        Card
      </StudyCardTransition>,
    );
    act(() => {
      ref.current!.dismiss(false, commit);
    });
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(commit).not.toHaveBeenCalled();
  });

  it('grades immediately with reduced motion and unlocks a repeated card', () => {
    const ref = createRef<StudyCardTransitionHandle>();
    const commit = vi.fn();
    const view = render(
      <StudyCardTransition ref={ref} cardId="one" phase="answer" multiplier={0}>
        Card
      </StudyCardTransition>,
    );
    act(() => {
      ref.current!.dismiss(false, commit);
    });
    expect(commit).toHaveBeenCalledOnce();
    view.rerender(
      <StudyCardTransition ref={ref} cardId="one" phase="question" multiplier={0}>
        Card
      </StudyCardTransition>,
    );
    view.rerender(
      <StudyCardTransition ref={ref} cardId="one" phase="answer" multiplier={0}>
        Card
      </StudyCardTransition>,
    );
    act(() => {
      ref.current!.dismiss(true, commit);
    });
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
