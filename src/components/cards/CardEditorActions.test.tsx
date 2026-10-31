import { createRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CardEditorActions } from './CardEditorActions';

it('keeps the same count announcement mounted before and after a repeat save', () => {
  const props = {
    editing: false,
    canSave: true,
    isTouchMode: false,
    onCancel: vi.fn(),
    onSave: vi.fn(),
    saveAddRef: createRef<HTMLButtonElement>(),
    saveRef: createRef<HTMLButtonElement>(),
  };
  const { rerender } = render(<CardEditorActions {...props} addedCount={0} />);
  const status = screen.getByRole('status');
  expect(status).toBeEmptyDOMElement();
  rerender(<CardEditorActions {...props} addedCount={1} />);
  expect(screen.getByRole('status')).toBe(status);
  expect(status).toHaveTextContent('1 added');
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
});

it('keeps the touch dock above a keyboard that reduces only the visual viewport', () => {
  const originalViewport = window.visualViewport;
  const viewport = Object.assign(new EventTarget(), {
    height: window.innerHeight - 280,
    offsetTop: 0,
  });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  try {
    render(
      <CardEditorActions
        editing={false}
        canSave
        addedCount={0}
        isTouchMode
        onCancel={vi.fn()}
        onSave={vi.fn()}
        saveAddRef={createRef()}
        saveRef={createRef()}
      />,
    );
    const actions = screen.getByRole('region', { name: 'Card editor actions' });
    expect(actions).toHaveStyle({ bottom: '280px' });
    viewport.height = window.innerHeight - 180;
    viewport.offsetTop = 10;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(actions).toHaveStyle({ bottom: '170px' });
    viewport.height = window.innerHeight;
    viewport.offsetTop = 0;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(actions.style.bottom).toBe('');
  } finally {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalViewport,
    });
  }
});
