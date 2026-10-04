import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AiFloatingWindow } from './AiFloatingWindow';
import { clampPosition } from './useDraggableWindow';

describe('clampPosition', () => {
  const size = { width: 420, height: 300 };
  const viewport = { width: 1000, height: 700 };

  it('keeps the window inside the viewport on every side', () => {
    expect(clampPosition({ left: -50, top: -50 }, size, viewport)).toEqual({ left: 8, top: 8 });
    expect(clampPosition({ left: 5000, top: 5000 }, size, viewport)).toEqual({
      left: 1000 - 420 - 8,
      top: 700 - 300 - 8,
    });
  });

  it('leaves an in-bounds position alone', () => {
    expect(clampPosition({ left: 100, top: 120 }, size, viewport)).toEqual({ left: 100, top: 120 });
  });
});

function Harness() {
  return (
    <AiFloatingWindow open multiplier={0}>
      {(controls) => (
        <section aria-label="Window">
          <header {...controls.handleProps} data-testid="handle">
            <button type="button" onClick={controls.onToggleMinimise}>
              {controls.minimised ? 'Expand' : 'Minimise'}
            </button>
          </header>
        </section>
      )}
    </AiFloatingWindow>
  );
}

describe('AiFloatingWindow', () => {
  beforeEach(() => sessionStorage.clear());

  it('drags by the header, clamps to the viewport and remembers the position', () => {
    render(<Harness />);
    const handle = screen.getByTestId('handle');
    const frame = handle.closest('.fixed') as HTMLElement;
    frame.getBoundingClientRect = () =>
      ({ left: 100, top: 100, width: 420, height: 300, right: 520, bottom: 400 }) as DOMRect;

    fireEvent.pointerDown(handle, { button: 0, clientX: 110, clientY: 110, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 210, clientY: 160, pointerId: 1 });
    expect(frame.style.left).toBe('200px');
    expect(frame.style.top).toBe('150px');

    fireEvent.pointerMove(handle, { clientX: -900, clientY: -900, pointerId: 1 });
    expect(frame.style.left).toBe('8px');
    expect(frame.style.top).toBe('8px');
    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(JSON.parse(sessionStorage.getItem('lacuna-ai-window-position') ?? 'null')).toEqual({
      left: 8,
      top: 8,
    });
  });

  it('does not start a drag from a control inside the header', () => {
    render(<Harness />);
    const frame = screen.getByTestId('handle').closest('.fixed') as HTMLElement;
    const before = frame.getAttribute('style');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Minimise' }), {
      button: 0,
      clientX: 5,
      clientY: 5,
      pointerId: 1,
    });
    fireEvent.pointerMove(screen.getByTestId('handle'), { clientX: 300, clientY: 300, pointerId: 1 });
    expect(frame.getAttribute('style')).toBe(before);
  });

  it('toggles the minimised state', () => {
    render(<Harness />);
    act(() => screen.getByRole('button', { name: 'Minimise' }).click());
    expect(screen.getByRole('button', { name: 'Expand' })).toBeVisible();
  });
});
