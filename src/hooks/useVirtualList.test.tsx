import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVirtualList } from './useVirtualList';

let resizeCallback: ResizeObserverCallback | null = null;

class ResizeObserverMock implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

function Fixture() {
  const [, rerender] = useState(0);
  const virtual = useVirtualList({ itemCount: 100, estimateSize: 100, enabled: true });
  return (
    <div data-testid="scroll-root" style={{ height: 300, overflowY: 'auto' }}>
      <div
        ref={virtual.containerRef}
        data-testid="list"
        data-top="100"
        style={{ height: virtual.totalHeight }}
      >
        {virtual.virtualItems.map((item) => (
          <div key={item.key} ref={virtual.measureRef(item.index)} data-testid={`item-${item.index}`} />
        ))}
      </div>
      <button type="button" onClick={() => rerender((value) => value + 1)}>Rerender</button>
    </div>
  );
}

describe('useVirtualList', () => {
  beforeEach(() => {
    resizeCallback = null;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.testid === 'scroll-root') {
        return { top: 0, bottom: 300, height: 300, left: 0, right: 500, width: 500, x: 0, y: 0, toJSON() {} };
      }
      const top = Number(this.dataset.top ?? 0);
      return { top, bottom: top + 100, height: 100, left: 0, right: 500, width: 500, x: 0, y: top, toJSON() {} };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('updates its range when the nearest scrolling ancestor scrolls', async () => {
    render(<Fixture />);
    await screen.findByTestId('item-0');
    const list = screen.getByTestId('list');
    list.dataset.top = '-700';
    act(() => {
      screen.getByTestId('scroll-root').dispatchEvent(new Event('scroll'));
    });
    await waitFor(() => expect(screen.getByTestId('item-8')).toBeInTheDocument());
  });

  it('recalculates layout when ResizeObserver reports a changed row height', async () => {
    render(<Fixture />);
    const list = await screen.findByTestId('list');
    const initialHeight = Number((list as HTMLElement).style.height.replace('px', ''));
    expect(resizeCallback).not.toBeNull();
    act(() => {
      resizeCallback?.(
        [{ contentRect: { height: 220 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
    await waitFor(() => {
      expect(Number((list as HTMLElement).style.height.replace('px', ''))).toBe(initialHeight + 120);
    });
  });
});
