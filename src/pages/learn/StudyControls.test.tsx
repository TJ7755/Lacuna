import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { LazyMotion, domAnimation } from 'motion/react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudyControls } from './StudyControls';
import type { AutoMark } from './types';

describe('StudyControls typed answers', () => {
  it('keeps the question open when Enter confirms an IME candidate', () => {
    const onReveal = vi.fn();
    const view = render(
      <LazyMotion features={domAnimation}>
        <StudyControls
          phase="question"
          isTypingCard
          isTouchMode={false}
          gradingMode="silent"
          typedAnswer=""
          typingInputRef={createRef<HTMLInputElement>()}
          onTypedAnswer={vi.fn()}
          onReveal={onReveal}
          onHide={vi.fn()}
          onAnswer={vi.fn()}
          m={0}
        />
      </LazyMotion>,
    );
    try {
      const input = view.getByRole('textbox', { name: 'Your answer' });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true });
      expect(onReveal).not.toHaveBeenCalled();

      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: false });
      expect(onReveal).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
    }
  });
});

it.each([false, true])(
  'responds on the corresponding grade button for keyboard grade %s',
  (input) => {
    const props = {
      phase: 'answer' as const,
      isTypingCard: false,
      isTouchMode: false,
      gradingMode: 'silent' as const,
      typedAnswer: '',
      typingInputRef: createRef<HTMLInputElement>(),
      onTypedAnswer: vi.fn(),
      onReveal: vi.fn(),
      onHide: vi.fn(),
      onAnswer: vi.fn(),
      m: 1,
    };
    const view = render(
      <LazyMotion features={domAnimation}>
        <StudyControls {...props} />
      </LazyMotion>,
    );
    view.rerender(
      <LazyMotion features={domAnimation}>
        <StudyControls {...props} feedback={{ input, serial: 1 }} />
      </LazyMotion>,
    );
    const button = view.getByRole('button', { name: input ? 'Yes' : 'No' });
    expect(button).toHaveAttribute('data-study-grade-active', 'true');
    expect(view.getByRole('button', { name: input ? 'No' : 'Yes' })).not.toHaveAttribute(
      'data-study-grade-active',
      'true',
    );
    fireEvent.click(button);
    expect(props.onAnswer).toHaveBeenCalledExactlyOnceWith(input, 'keyboard');
    view.unmount();
  },
);

describe('StudyControls automatic marking', () => {
  const props = {
    isTypingCard: true,
    isTouchMode: false,
    gradingMode: 'silent' as const,
    typedAnswer: 'Red',
    typingInputRef: createRef<HTMLInputElement>(),
    onTypedAnswer: vi.fn(),
    onReveal: vi.fn(),
    onHide: vi.fn(),
    onAnswer: vi.fn(),
    m: 0,
  };

  it.each(
    [
      { pending: true },
      { pending: false, correct: true },
      { pending: false, correct: false },
    ] as AutoMark[],
  )('offers no self-marking grades while automatic marking owns the answer (%o)', (autoMark) => {
    const view = render(
      <LazyMotion features={domAnimation}>
        <StudyControls {...props} phase="answer" autoMark={autoMark} />
      </LazyMotion>,
    );
    try {
      expect(view.queryByRole('button', { name: 'Yes' })).toBeNull();
      expect(view.queryByRole('button', { name: 'No' })).toBeNull();
    } finally {
      view.unmount();
    }
  });

  it('keeps the self-marking grades when automatic marking is not in play', () => {
    const view = render(
      <LazyMotion features={domAnimation}>
        <StudyControls {...props} phase="answer" />
      </LazyMotion>,
    );
    try {
      expect(view.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
      expect(view.getByRole('button', { name: 'No' })).toBeInTheDocument();
    } finally {
      view.unmount();
    }
  });

  it('drains on accepted departure, retargets on cancellation and reforms an immediately usable question', async () => {
    const inputRef = createRef<HTMLInputElement>();
    const controls = (phase: 'answer' | 'question', departing = false, pending = false) => (
      <LazyMotion features={domAnimation}>
        <StudyControls
          {...props}
          typingInputRef={inputRef}
          phase={phase}
          autoMark={pending ? { pending: true } : { pending: false, correct: false }}
          departing={departing}
        />
      </LazyMotion>
    );
    const view = render(controls('answer', false, true));
    try {
      const liquid = view.container.querySelector('[data-flow-layer]');
      const verdict = liquid?.querySelector('[data-flow-verdict] circle');
      expect(liquid).toHaveAttribute('data-flow-state', 'bead');
      await waitFor(() => expect(verdict).toHaveStyle({ transform: 'scale(0)' }));

      view.rerender(controls('answer'));
      await waitFor(() => expect(verdict).toHaveStyle({ transform: 'none' }));
      expect(liquid?.querySelector('[data-flow-colour]')?.getAttribute('style')).toContain(
        'fill: var(--color-negative)',
      );
      view.rerender(controls('answer', true));
      expect(liquid).toHaveAttribute('data-flow-state', 'draining');
      await waitFor(() => expect(verdict).toHaveStyle({ transform: 'scale(0)' }));

      view.rerender(controls('answer'));
      expect(liquid).toHaveAttribute('data-flow-state', 'bead');
      await waitFor(() => expect(verdict).toHaveStyle({ transform: 'none' }));

      // The next question takes ownership even before the departure callback resets.
      view.rerender(controls('question', true));
      expect(view.container.querySelector('[data-flow-layer]')).toBe(liquid);
      expect(liquid).toHaveAttribute('data-flow-state', 'pill');
      expect(liquid).toHaveClass('invisible');
      expect(liquid?.querySelector('[data-flow-verdict]')?.getAttribute('style')).toContain(
        'fill: var(--color-negative)',
      );
      expect(view.getByRole('textbox', { name: 'Your answer' })).toHaveFocus();
      fireEvent.click(view.getByRole('button', { name: 'Check answer' }));
      expect(props.onReveal).toHaveBeenCalled();

      view.rerender(
        <LazyMotion features={domAnimation}>
          <StudyControls {...props} phase="question" isTypingCard={false} />
        </LazyMotion>,
      );
      expect(view.container.querySelector('[data-flow-layer]')).toBe(liquid);
      expect(view.getByRole('button', { name: 'Show answer' })).toBeVisible();
    } finally {
      view.unmount();
    }
  });
});

describe('StudyControls Flow fill', () => {
  const props = {
    isTypingCard: false,
    isTouchMode: false,
    gradingMode: 'silent' as const,
    typedAnswer: '',
    typingInputRef: createRef<HTMLInputElement>(),
    onTypedAnswer: vi.fn(),
    onReveal: vi.fn(),
    onHide: vi.fn(),
    onAnswer: vi.fn(),
    m: 0,
  };

  it('keeps the reveal and primary grade fills until the Flow fill is measured', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <LazyMotion features={domAnimation}>
        <StudyControls {...props} phase="question" />
      </LazyMotion>,
    );
    expect(container.querySelector('[data-flow-layer]')).toBeNull();
    for (const name of ['Show answer', 'Yes']) {
      const button = [...container.querySelectorAll('button')].find(
        (element) => element.textContent === name,
      );
      expect(button?.className).not.toContain('bg-transparent!');
    }
  });

  it('connects measured controls without removing their readable button fills', () => {
    const view = render(
      <LazyMotion features={domAnimation}>
        <StudyControls {...props} phase="answer" />
      </LazyMotion>,
    );
    const layer = view.container.querySelector('[data-flow-layer]');
    expect(layer?.querySelector('[data-flow-colour]')).not.toBeNull();
    expect(view.getByText('Show answer', { selector: 'button' })).not.toHaveClass(
      'bg-transparent!',
    );
    expect(
      view.getByRole('button', { name: 'Yes' }).closest('[data-flow-primary]'),
    ).not.toHaveClass('[&_button]:bg-transparent!');
    expect(view.getByRole('button', { name: 'No' }).closest('[data-flow-primary]')).toBeNull();
    view.unmount();
  });

  it('draws the four-point split as liquid, then restores the grade buttons', () => {
    vi.useFakeTimers();
    const manual = { ...props, gradingMode: 'manual' as const, m: 1 };
    const view = render(
      <LazyMotion features={domAnimation}>
        <StudyControls {...manual} phase="question" />
      </LazyMotion>,
    );
    const bare = (name: string) =>
      view.getByRole('button', { name }).closest('[class*="[&_button]:bg-transparent!"]') !== null;
    try {
      view.rerender(
        <LazyMotion features={domAnimation}>
          <StudyControls {...manual} phase="answer" />
        </LazyMotion>,
      );
      expect(['Again', 'Hard', 'Good', 'Easy'].map(bare)).toEqual([true, true, true, true]);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(['Again', 'Hard', 'Good', 'Easy'].map(bare)).toEqual([false, false, false, false]);
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('hands chrome back immediately when reduced motion interrupts a flowing control', () => {
    const controls = (phase: 'question' | 'answer', m: number) => (
      <LazyMotion features={domAnimation}>
        <StudyControls {...props} phase={phase} m={m} />
      </LazyMotion>
    );
    const view = render(controls('question', 1));
    try {
      view.rerender(controls('answer', 1));
      expect(view.container.querySelector('[data-flow-layer]')).not.toHaveClass('invisible');
      view.rerender(controls('question', 0));
      expect(view.container.querySelector('[data-flow-layer]')).toHaveClass('invisible');
      expect(view.getByRole('button', { name: 'Show answer' }).parentElement?.parentElement)
        .not.toHaveClass('[&_button]:bg-transparent!');
    } finally {
      view.unmount();
    }
  });
});
