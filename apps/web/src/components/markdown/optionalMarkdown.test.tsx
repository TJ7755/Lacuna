import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useOptionalMarkdown } from './optionalMarkdown';

const loaders = vi.hoisted(() => ({ math: vi.fn(), highlight: vi.fn() }));
vi.mock('./optionalMarkdownMath', () => {
  loaders.math();
  return { default: () => () => {} };
});
vi.mock('rehype-highlight', () => {
  loaders.highlight();
  return { default: () => () => {} };
});

describe('optional Markdown renderers', () => {
  it('keeps plain Markdown and Mermaid independent of maths and highlighting', async () => {
    const { result, rerender } = renderHook(({ source }) => useOptionalMarkdown(source), {
      initialProps: { source: '**Plain** Markdown' },
    });
    expect(result.current).toEqual({});
    expect(loaders.math).not.toHaveBeenCalled();
    expect(loaders.highlight).not.toHaveBeenCalled();
    rerender({ source: '```mermaid\nflowchart TD\nA-->B\n```' });
    expect(loaders.highlight).not.toHaveBeenCalled();
    rerender({ source: '$x^2$' });
    await waitFor(() => expect(result.current.math).toBeTypeOf('function'));
    expect(loaders.math).toHaveBeenCalledOnce();
    expect(loaders.highlight).not.toHaveBeenCalled();
    rerender({ source: '```js\nconst x = 1;\n```' });
    await waitFor(() => expect(result.current.highlight).toBeTypeOf('function'));
    expect(loaders.highlight).toHaveBeenCalledOnce();
  });

  it('uses warmed renderers in the first render of a newly mounted view', async () => {
    const source = '$x^2$\n\n```js\nconst x = 1;\n```';
    const warmed = renderHook(() => useOptionalMarkdown(source));
    await waitFor(() => {
      expect(warmed.result.current.math).toBeTypeOf('function');
      expect(warmed.result.current.highlight).toBeTypeOf('function');
    });
    warmed.unmount();

    const renders: { math: boolean; highlight: boolean }[] = [];
    const remounted = renderHook(() => {
      const plugins = useOptionalMarkdown(source);
      renders.push({ math: Boolean(plugins.math), highlight: Boolean(plugins.highlight) });
      return plugins;
    });
    await waitFor(() => {
      expect(remounted.result.current.math).toBeTypeOf('function');
      expect(remounted.result.current.highlight).toBeTypeOf('function');
    });
    expect(renders).toEqual([{ math: true, highlight: true }]);

    const plain = renderHook(() => useOptionalMarkdown('Plain Markdown'));
    expect(plain.result.current).toEqual({});
  });
});
