import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { scrollEdgeMask, useScrollEdges } from './useScrollEdges';

function List({ onEdges }: { onEdges: (edges: { top: boolean; bottom: boolean }) => void }) {
  const [ref, edges] = useScrollEdges<HTMLDivElement>();
  onEdges(edges);
  return <div ref={ref} data-testid="list" />;
}

function size(element: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight });
}

describe('useScrollEdges', () => {
  it('reports the edges that hide content as the list scrolls', async () => {
    let edges = { top: false, bottom: false };
    const { getByTestId } = render(<List onEdges={(next) => (edges = next)} />);
    const list = getByTestId('list');
    size(list, 600, 200);
    await act(async () => {
      list.dispatchEvent(new Event('scroll'));
    });
    expect(edges).toEqual({ top: false, bottom: true });
    list.scrollTop = 400;
    await act(async () => {
      list.dispatchEvent(new Event('scroll'));
    });
    expect(edges).toEqual({ top: true, bottom: false });
  });

  it('masks only the edges that hide content', () => {
    expect(scrollEdgeMask({ top: false, bottom: false })).toBeUndefined();
    expect(scrollEdgeMask({ top: false, bottom: true })).toBe(
      'linear-gradient(to bottom, black, black calc(100% - 24px), transparent)',
    );
  });
});
