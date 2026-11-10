import { useState } from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVirtualList } from './useVirtualList';

const resizeObservers: ResizeObserverMock[] = [];

function notifyResize(target: Element, size: Partial<ResizeObserverEntry>) {
  for (const observer of resizeObservers) {
    if (observer.targets.has(target)) {
      observer.callback([{ target, ...size } as ResizeObserverEntry], observer);
    }
  }
}

class ResizeObserverMock implements ResizeObserver {
  readonly targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    resizeObservers.push(this);
  }
  disconnect = vi.fn(() => this.targets.clear());
  observe = vi.fn((target: Element) => {
    this.targets.add(target);
  });
  unobserve = vi.fn((target: Element) => {
    this.targets.delete(target);
  });
}

function Fixture({
  itemCount = 100,
  pinnedIndices,
}: {
  itemCount?: number;
  pinnedIndices?: number[];
}) {
  const [, rerender] = useState(0);
  const virtual = useVirtualList({ itemCount, estimateSize: 100, enabled: true, pinnedIndices });
  return (
    <div data-testid="scroll-root" style={{ height: 300, overflowY: 'auto' }}>
      <div data-testid="layout">
        <div
          ref={virtual.containerRef}
          data-testid="list"
          data-top="100"
          style={{ height: virtual.totalHeight }}
        >
          {virtual.virtualItems.map((item) => (
            <div
              key={item.key}
              ref={virtual.measureRef(item.index)}
              data-testid={`item-${item.index}`}
            />
          ))}
        </div>
      </div>
      <button type="button" onClick={() => rerender((value) => value + 1)}>
        Rerender
      </button>
    </div>
  );
}

describe('useVirtualList', () => {
  beforeEach(() => {
    resizeObservers.length = 0;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset.testid === 'scroll-root') {
        return {
          top: 0,
          bottom: 300,
          height: 300,
          left: 0,
          right: 500,
          width: 500,
          x: 0,
          y: 0,
          toJSON() {},
        };
      }
      const top = Number(this.dataset.top ?? 0);
      return {
        top,
        bottom: top + 100,
        height: Number(this.dataset.height ?? 100),
        left: 0,
        right: 500,
        width: 500,
        x: 0,
        y: top,
        toJSON() {},
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the initial resize observation without forcing layout while attaching a row ref', () => {
    const { result } = renderHook(() => useVirtualList({ itemCount: 2, estimateSize: 100 }));
    const row = document.createElement('div');
    const geometry = vi.spyOn(row, 'getBoundingClientRect');
    act(() => result.current.measureRef(0)(row));

    expect(geometry).not.toHaveBeenCalled();
    expect(result.current.totalHeight).toBe(200);
    act(() => {
      notifyResize(row, {
        contentRect: { height: 180 } as DOMRectReadOnly,
        borderBoxSize: [{ blockSize: 220, inlineSize: 500 }],
      });
    });
    expect(result.current.totalHeight).toBe(320);
  });

  it('measures an attached row immediately when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { result } = renderHook(() => useVirtualList({ itemCount: 2, estimateSize: 100 }));
    const row = document.createElement('div');
    row.dataset.height = '220';
    const geometry = vi.spyOn(row, 'getBoundingClientRect');
    act(() => result.current.measureRef(0)(row));

    expect(geometry).toHaveBeenCalledOnce();
    expect(result.current.totalHeight).toBe(320);
  });

  it('measures multiple rows with one observer and releases detached rows', () => {
    const { result } = renderHook(() => useVirtualList({ itemCount: 2, estimateSize: 100 }));
    const first = document.createElement('div');
    const second = document.createElement('div');
    const attachFirst = result.current.measureRef(0);
    const attachSecond = result.current.measureRef(1);
    act(() => {
      attachFirst(first);
      attachSecond(second);
    });

    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].targets).toEqual(new Set([first, second]));
    act(() => {
      notifyResize(first, { borderBoxSize: [{ blockSize: 170, inlineSize: 500 }] });
      notifyResize(second, { borderBoxSize: [{ blockSize: 130, inlineSize: 500 }] });
      attachFirst(null);
    });
    expect(result.current.totalHeight).toBe(300);
    expect(resizeObservers[0].targets).toEqual(new Set([second]));
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

  it('retains only explicitly pinned active rows outside the viewport', async () => {
    const { rerender } = render(<Fixture pinnedIndices={[0]} />);
    const list = await screen.findByTestId('list');
    list.dataset.top = '-11000';
    act(() => {
      screen.getByTestId('scroll-root').dispatchEvent(new Event('scroll'));
    });
    await waitFor(() => expect(screen.queryAllByTestId(/^item-/)).toHaveLength(1));
    expect(screen.getByTestId('item-0')).toBeInTheDocument();
    rerender(<Fixture />);
    await waitFor(() => expect(screen.queryByTestId('item-0')).not.toBeInTheDocument());
  });

  it('keeps trailing overscan rows when the viewport is just below the list', async () => {
    render(<Fixture />);
    const list = await screen.findByTestId('list');
    list.dataset.top = '-10100';
    act(() => {
      screen.getByTestId('scroll-root').dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => expect(screen.getByTestId('item-99')).toBeInTheDocument());
    expect(screen.queryAllByTestId(/^item-/)).toHaveLength(3);
    expect(screen.queryByTestId('item-0')).not.toBeInTheDocument();
  });

  it('does not mount overscan rows for a lesson far below the viewport', async () => {
    render(<Fixture />);
    await screen.findByTestId('item-5');
    const list = await screen.findByTestId('list');
    list.dataset.top = '5000';
    act(() => {
      screen.getByTestId('scroll-root').dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => expect(screen.queryAllByTestId(/^item-/)).toHaveLength(0));
    list.dataset.top = '100';
    act(() => {
      screen.getByTestId('scroll-root').dispatchEvent(new Event('scroll'));
    });
    await waitFor(() => expect(screen.getByTestId('item-4')).toBeInTheDocument());
  });

  it('updates an off-screen lesson when surrounding layout changes without scrolling', async () => {
    render(<Fixture />);
    await screen.findByTestId('item-5');
    const list = screen.getByTestId('list');
    list.dataset.top = '5000';
    act(() => {
      notifyResize(screen.getByTestId('layout'), {
        contentRect: { height: 15000 } as DOMRectReadOnly,
      });
    });

    await waitFor(() => expect(screen.queryAllByTestId(/^item-/)).toHaveLength(0));
  });

  it('uses the visible part of the viewport when a lesson starts part-way down it', async () => {
    render(<Fixture />);
    await screen.findByTestId('item-5');
    const list = await screen.findByTestId('list');
    list.dataset.top = '250';
    act(() => {
      screen.getByTestId('scroll-root').dispatchEvent(new Event('scroll'));
    });

    await waitFor(() => expect(screen.queryAllByTestId(/^item-/)).toHaveLength(4));
    expect(screen.queryByTestId('item-4')).not.toBeInTheDocument();
  });

  it('recalculates layout when ResizeObserver reports a changed row height', async () => {
    render(<Fixture />);
    const list = await screen.findByTestId('list');
    const initialHeight = Number((list as HTMLElement).style.height.replace('px', ''));
    act(() => {
      notifyResize(screen.getByTestId('item-0'), {
        contentRect: { height: 220 } as DOMRectReadOnly,
      });
    });
    await waitFor(() => {
      expect(Number((list as HTMLElement).style.height.replace('px', ''))).toBe(
        initialHeight + 120,
      );
    });
  });
  it('retains mounted row measurements after the card count changes', async () => {
    const { rerender } = render(<Fixture itemCount={100} />);
    const row = await screen.findByTestId('item-0');
    row.dataset.height = '220';
    const list = screen.getByTestId('list');
    rerender(<Fixture itemCount={101} />);
    await waitFor(() => expect(list.style.height).toBe('10220px'));
  });

  it('includes padding and borders in observed row heights', async () => {
    render(<Fixture />);
    const list = await screen.findByTestId('list');
    const initialHeight = parseFloat(list.style.height);
    act(() => {
      notifyResize(screen.getByTestId('item-0'), {
        contentRect: { height: 180 } as DOMRectReadOnly,
        borderBoxSize: [{ blockSize: 220, inlineSize: 500 }],
      });
    });
    await waitFor(() => expect(parseFloat(list.style.height)).toBe(initialHeight + 120));
  });

  it('keeps the previous layout while a mounted row is temporarily hidden', async () => {
    render(<Fixture />);
    const row = await screen.findByTestId('item-0');
    const list = screen.getByTestId('list');
    const initialHeight = list.style.height;
    act(() => {
      notifyResize(row, { borderBoxSize: [{ blockSize: 0, inlineSize: 0 }] });
    });
    expect(list.style.height).toBe(initialHeight);
  });
});
