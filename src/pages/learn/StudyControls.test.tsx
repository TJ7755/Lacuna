import { createRef } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudyControls } from './StudyControls';

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
