import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadRenderer = vi.fn();
const loadPurifier = vi.fn();
const initialise = vi.fn();
const render = vi.fn(async () => ({ svg: '<svg><text>Diagram</text></svg>' }));
const sanitise = vi.fn((svg: string) => svg);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doMock('mermaid', () => {
    loadRenderer();
    return { default: { initialize: initialise, render } };
  });
  vi.doMock('dompurify', () => {
    loadPurifier();
    return { default: { sanitize: sanitise } };
  });
});

afterEach(() => {
  vi.doUnmock('mermaid');
  vi.doUnmock('dompurify');
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function diagram(): HTMLElement {
  const container = document.createElement('div');
  const block = document.createElement('pre');
  block.className = 'lacuna-mermaid';
  block.textContent = 'flowchart TD\n A-->B';
  container.appendChild(block);
  document.body.appendChild(container);
  return container;
}

describe('Mermaid dependency loading', () => {
  it('loads browser dependencies only when a diagram mounts', async () => {
    const { renderMermaidDiagrams } = await import('./mermaid');
    await renderMermaidDiagrams(document.createElement('div'));
    expect(loadRenderer).not.toHaveBeenCalled();
    expect(loadPurifier).not.toHaveBeenCalled();
    expect(initialise).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(sanitise).not.toHaveBeenCalled();

    const container = diagram();
    await renderMermaidDiagrams(container);
    await renderMermaidDiagrams(container);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.lacuna-mermaid-source code')?.textContent).toBe(
      'flowchart TD\n A-->B',
    );
    expect(loadRenderer).toHaveBeenCalledOnce();
    expect(loadPurifier).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
    expect(sanitise).toHaveBeenCalledOnce();
  });

  it('does not preload dependencies without a browser window', async () => {
    vi.stubGlobal('window', undefined);
    await import('./mermaid');
    expect(loadRenderer).not.toHaveBeenCalled();
    expect(loadPurifier).not.toHaveBeenCalled();
  });

  it.each(['mermaid', 'dompurify'])(
    'keeps source readable when %s fails to load',
    async (module) => {
      vi.doMock(module, () => {
        throw new Error('Dependency unavailable');
      });
      const { renderMermaidDiagrams } = await import('./mermaid');
      const container = diagram();
      await expect(renderMermaidDiagrams(container)).resolves.toBeUndefined();
      expect(container.querySelector('svg')).toBeNull();
      expect(container.querySelector('pre')?.textContent).toBe('flowchart TD\n A-->B');
      expect(container.querySelector('[data-mermaid-rendered]')).toBeNull();
    },
  );
});
