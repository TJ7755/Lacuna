import { afterEach, describe, expect, it, vi } from 'vitest';
import { animate } from 'motion/mini';
import { revealPageParts } from './PageArrival';

vi.mock('motion/mini', () => ({ animate: vi.fn() }));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.mocked(animate).mockReset();
});

function surface(top: number, reads: number[]) {
  const root = document.createElement('div');
  root.dataset.pageArrival = '';
  const part = document.createElement('div');
  part.dataset.pagePart = '';
  part.style.animationName = 'none';
  part.style.willChange = 'transform';
  root.append(part);
  document.body.append(root);
  vi.spyOn(part, 'getBoundingClientRect').mockImplementation(() => {
    reads.push(top);
    return { top, height: 100 } as DOMRect;
  });
  return { root, part };
}

describe('page arrivals', () => {
  it('measures all arrivals in a commit before any animation writes styles', async () => {
    const reads: number[] = [];
    const first = surface(10, reads);
    const second = surface(20, reads);
    const measuredAtAnimation: number[][] = [];
    vi.mocked(animate).mockImplementation(() => {
      measuredAtAnimation.push([...reads]);
      return { stop: vi.fn() } as unknown as ReturnType<typeof animate>;
    });
    const stopFirst = revealPageParts(first.root, 1);
    const stopSecond = revealPageParts(second.root, 1);
    await Promise.resolve();
    expect(measuredAtAnimation).toHaveLength(2);
    expect(
      measuredAtAnimation.every(
        (measurements) => measurements.includes(10) && measurements.includes(20),
      ),
    ).toBe(true);
    expect(first.part.style.opacity).toBe('0');
    expect(second.part.style.opacity).toBe('0');
    expect(animate).toHaveBeenCalledWith(
      first.part,
      { opacity: [0, expect.any(Number)] },
      expect.objectContaining({ visualDuration: 0.18, delay: 0 }),
    );
    stopFirst?.();
    stopSecond?.();
    expect(first.part.style.opacity).toBe('');
    expect(first.part.style.willChange).toBe('transform');
  });

  it('cancels an unmounted arrival before the queued measurement', async () => {
    const reads: number[] = [];
    const { root, part } = surface(10, reads);
    const stop = revealPageParts(root, 1);
    stop?.();
    await Promise.resolve();
    expect(reads).toEqual([]);
    expect(animate).not.toHaveBeenCalled();
    expect(part.style.opacity).toBe('');
  });

  it('restores the surface after the browser finishes the introduction', async () => {
    const { root, part } = surface(10, []);
    vi.mocked(animate).mockReturnValue({ stop: vi.fn() } as unknown as ReturnType<typeof animate>);
    const stop = revealPageParts(root, 1);
    await Promise.resolve();
    const options = vi.mocked(animate).mock.calls[0][2] as { onComplete: () => void };
    options.onComplete();
    expect(part.style.opacity).toBe('');
    expect(part.style.willChange).toBe('transform');
    stop?.();
  });
});
