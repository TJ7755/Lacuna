import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useCourseSectionSwipe } from './useCourseSectionSwipe';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function createWrapper(initialEntry: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        {children}
        <LocationProbe />
      </MemoryRouter>
    );
  };
}

function pointerEvent(
  clientX: number,
  clientY: number,
  currentTarget: {
    setPointerCapture: ReturnType<typeof vi.fn>;
    releasePointerCapture: ReturnType<typeof vi.fn>;
  },
  target?: EventTarget,
): React.PointerEvent {
  return {
    pointerId: 1,
    pointerType: 'touch',
    clientX,
    clientY,
    currentTarget,
    target,
  } as unknown as React.PointerEvent;
}

describe('useCourseSectionSwipe', () => {
  it('keeps the direction chosen at the threshold if the finger eases back', async () => {
    const capture = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const { result } = renderHook(() => useCourseSectionSwipe(), {
      wrapper: createWrapper('/course/abc'),
    });

    act(() => {
      result.current.onPointerDown(pointerEvent(200, 100, capture));
      result.current.onPointerMove(pointerEvent(120, 100, capture));
      result.current.onPointerMove(pointerEvent(190, 100, capture));
      result.current.onPointerUp(pointerEvent(190, 100, capture));
    });

    await waitFor(() =>
      expect(document.querySelector('[data-testid="location"]')).toHaveTextContent(
        '/course/abc/cards',
      ),
    );
    expect(capture.setPointerCapture).toHaveBeenCalledWith(1);
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('does not navigate after a cancelled gesture', async () => {
    const capture = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const { result } = renderHook(() => useCourseSectionSwipe(), {
      wrapper: createWrapper('/course/abc/cards'),
    });

    act(() => {
      result.current.onPointerDown(pointerEvent(100, 100, capture));
      result.current.onPointerMove(pointerEvent(180, 100, capture));
      result.current.onPointerCancel(pointerEvent(180, 100, capture));
      result.current.onPointerUp(pointerEvent(180, 100, capture));
    });

    await waitFor(() =>
      expect(document.querySelector('[data-testid="location"]')).toHaveTextContent(
        '/course/abc/cards',
      ),
    );
  });

  it('does not claim a gesture that starts on an interactive control', async () => {
    const capture = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const button = document.createElement('button');
    const { result } = renderHook(() => useCourseSectionSwipe(), {
      wrapper: createWrapper('/course/abc'),
    });

    act(() => {
      result.current.onPointerDown(pointerEvent(200, 100, capture, button));
      result.current.onPointerMove(pointerEvent(100, 100, capture, button));
      result.current.onPointerUp(pointerEvent(100, 100, capture, button));
    });

    await waitFor(() =>
      expect(document.querySelector('[data-testid="location"]')).toHaveTextContent('/course/abc'),
    );
    expect(capture.setPointerCapture).not.toHaveBeenCalled();
  });

  it('lets a predominantly vertical gesture remain a scroll', async () => {
    const capture = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const { result } = renderHook(() => useCourseSectionSwipe(), {
      wrapper: createWrapper('/course/abc/cards'),
    });

    act(() => {
      result.current.onPointerDown(pointerEvent(100, 100, capture));
      result.current.onPointerMove(pointerEvent(120, 180, capture));
      result.current.onPointerUp(pointerEvent(120, 180, capture));
    });

    await waitFor(() =>
      expect(document.querySelector('[data-testid="location"]')).toHaveTextContent(
        '/course/abc/cards',
      ),
    );
  });
});
