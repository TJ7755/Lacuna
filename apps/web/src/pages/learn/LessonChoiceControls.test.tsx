import { act, fireEvent, render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { expect, it, vi } from 'vitest';
import { LessonChoiceControls } from './LessonChoiceControls';

it('checks a numbered choice without tabbing, announces the verdict, and resumes auto-advance after a pause', () => {
  vi.useFakeTimers();
  const card = { id: 'a', prompt: 'Apple', answer: 'pomme' };
  const candidates = [card, { id: 'b', prompt: 'Pear', answer: 'poire' }];
  const onCheck = vi.fn(() => true);
  const onAdvance = vi.fn();
  const view = (paused: boolean) => (
    <LazyMotion features={domAnimation}>
      <main>
        <p id="prompt">Apple</p>
        <LessonChoiceControls
          card={card}
          promptId="prompt"
          candidates={candidates}
          rankedIds={[]}
          onCheck={onCheck}
          onAdvance={onAdvance}
          paused={paused}
          departing={false}
          m={0}
        />
      </main>
    </LazyMotion>
  );
  const rendered = render(view(false));
  try {
    const [first, second] = screen.getAllByRole<HTMLInputElement>('radio');
    fireEvent.keyDown(first, { key: '2', code: 'Digit2', ctrlKey: true });
    expect(second).not.toBeChecked();
    fireEvent.keyDown(first, { key: '2', code: 'Digit2' });
    expect(second).toBeChecked();
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: ' ', code: 'Space' });
    const correct = second.value === card.answer;
    expect(onCheck).toHaveBeenCalledExactlyOnceWith(correct);
    expect(rendered.container.querySelector('[data-study-choices]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(180));
    expect(screen.getByRole('status')).toHaveTextContent(
      correct ? 'Correct.' : 'Incorrect. Correct answer: pomme',
    );
    rendered.rerender(view(true));
    act(() => vi.advanceTimersByTime(1_000));
    expect(onAdvance).not.toHaveBeenCalled();
    rendered.rerender(view(false));
    act(() => vi.advanceTimersByTime(210));
    expect(onAdvance).toHaveBeenCalledExactlyOnceWith(correct);
  } finally {
    rendered.unmount();
    vi.useRealTimers();
  }
});
