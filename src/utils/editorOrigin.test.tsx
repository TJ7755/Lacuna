import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type * as ReactRouterDom from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { originFrom, useReturn } from './editorOrigin';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof ReactRouterDom>('react-router-dom')),
  useNavigate: () => navigate,
}));

function at(state: unknown) {
  return function Router({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[{ pathname: '/course/c1/cards/x/edit', state }]}>
        {children}
      </MemoryRouter>
    );
  };
}

afterEach(() => {
  navigate.mockReset();
  window.history.replaceState(null, '');
});

describe('useReturn', () => {
  it('steps back through history to the origin entry', () => {
    window.history.replaceState({ idx: 1 }, '');
    const origin = originFrom({ pathname: '/course/c1/cards', search: '?q=cell', hash: '' }, 'Cards');
    expect(origin.origin).toEqual({ path: '/course/c1/cards?q=cell', label: 'Cards', idx: 1 });
    window.history.replaceState({ idx: 3 }, '');
    const { result } = renderHook(() => useReturn({ path: '/fallback', label: 'Fallback' }), {
      wrapper: at(origin),
    });
    expect(result.current.label).toBe('Cards');
    result.current.goBack();
    expect(navigate).toHaveBeenCalledWith(-2);
  });

  it('returns to the origin path, query included, when it is not in history', () => {
    const { result } = renderHook(() => useReturn({ path: '/fallback', label: 'Fallback' }), {
      wrapper: at({ origin: { path: '/course/c1/cards?q=cell', label: 'Cards' } }),
    });
    result.current.goBack();
    expect(navigate).toHaveBeenCalledWith('/course/c1/cards?q=cell', { state: { returning: true } });
  });

  it('falls back to the route default after a deep link', () => {
    const { result } = renderHook(() => useReturn({ path: '/course/c1', label: 'Course' }), {
      wrapper: at(null),
    });
    expect(result.current.to).toBe('/course/c1');
    result.current.goBack();
    expect(navigate).toHaveBeenCalledWith('/course/c1', { state: { returning: true } });
  });
});

describe('useLeaveFlowWith', () => {
  it('steps back to the page that opened the flow, past its own entries', async () => {
    const { useLeaveFlowWith } = await import('./editorOrigin');
    window.history.replaceState({ idx: 4 }, '');
    const { result } = renderHook(() => useLeaveFlowWith(navigate, '/course/c1'));
    window.history.replaceState({ idx: 6 }, '');
    result.current();
    expect(navigate).toHaveBeenCalledWith(-3);
  });

  it('falls back to the route default when the flow was opened directly', async () => {
    const { useLeaveFlowWith } = await import('./editorOrigin');
    window.history.replaceState({ idx: 0 }, '');
    const { result } = renderHook(() => useLeaveFlowWith(navigate, '/course/c1'));
    result.current();
    expect(navigate).toHaveBeenCalledWith('/course/c1', { state: { returning: true } });
  });
});
