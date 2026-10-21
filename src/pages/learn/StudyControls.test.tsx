import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
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

describe('StudyControls liquid fill', () => {
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

  it('keeps the reveal and primary grade fills until the liquid is measured', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <LazyMotion features={domAnimation}>
        <StudyControls {...props} phase="question" />
      </LazyMotion>,
    );
    expect(container.querySelector('[data-liquid-layer]')).toBeNull();
    for (const name of ['Show answer', 'Yes']) {
      const button = [...container.querySelectorAll('button')].find(
        (element) => element.textContent === name,
      );
      expect(button?.className).not.toContain('bg-transparent!');
    }
  });

  it('draws the reveal and primary grade fills as liquid once measured', () => {
    const view = render(
      <LazyMotion features={domAnimation}>
        <StudyControls {...props} phase="answer" />
      </LazyMotion>,
    );
    const layer = view.container.querySelector('[data-liquid-layer]');
    expect(layer?.querySelector('[data-liquid-drop="primary"]')).not.toBeNull();
    expect(view.getByText('Show answer', { selector: 'button' })).toHaveClass('bg-transparent!');
    expect(view.getByRole('button', { name: 'Yes' }).closest('[data-liquid-primary]')).toHaveClass(
      '[&_button]:bg-transparent!',
    );
    expect(view.getByRole('button', { name: 'No' }).closest('[data-liquid-primary]')).toBeNull();
    view.unmount();
  });
});
