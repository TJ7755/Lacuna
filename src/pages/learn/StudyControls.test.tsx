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
