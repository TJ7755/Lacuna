import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMermaidDiagrams, resetMermaidInitialisation, updateMermaidTheme } from './mermaid';

const renderer = vi.hoisted(() => ({
  theme: 'light',
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock('mermaid', () => ({ default: renderer }));
vi.mock('dompurify', () => ({ default: { sanitize: (svg: string) => svg } }));

function diagram(): HTMLElement {
  const container = document.createElement('div');
  const block = document.createElement('pre');
  block.className = 'lacuna-mermaid';
  block.textContent = 'flowchart TD\n A-->B';
  container.appendChild(block);
  document.body.appendChild(container);
  return container;
}

function renderedTheme(container: HTMLElement): string | null {
  return container.querySelector('svg')?.getAttribute('data-palette') ?? null;
}

beforeEach(() => {
  document.documentElement.classList.remove('dark');
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        getPropertyValue: (token: string) => {
          if (token === '--accent-ink')
            return document.documentElement.dataset.accent === 'blue'
              ? '217 60% 30%'
              : '90 52% 19%';
          return document.documentElement.classList.contains('dark') ? '90 22% 12%' : '75 45% 99%';
        },
      }) as CSSStyleDeclaration,
  );
  resetMermaidInitialisation();
  renderer.initialize.mockImplementation(() => {
    renderer.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });
  renderer.render.mockImplementation(async () => ({
    svg: `<svg data-palette="${renderer.theme}"><text>Diagram</text></svg>`,
  }));
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete document.documentElement.dataset.accent;
  document.body.replaceChildren();
  document.documentElement.classList.remove('dark');
});

describe('Mermaid theme updates', () => {
  it('resolves the palette from current tokens and refreshes after an accent change', async () => {
    const container = diagram();
    await renderMermaidDiagrams(container);
    expect(renderer.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fontFamily: 'Instrument Sans, system-ui, sans-serif',
        themeVariables: expect.objectContaining({
          primaryBorderColor: 'hsl(90, 52%, 19%)',
          background: 'hsl(75, 45%, 99%)',
        }),
      }),
    );
    document.documentElement.dataset.accent = 'blue';
    await updateMermaidTheme(container);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        themeVariables: expect.objectContaining({ primaryBorderColor: 'hsl(217, 60%, 30%)' }),
      }),
    );
    document.documentElement.classList.add('dark');
    await updateMermaidTheme(container);
    expect(renderer.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        themeVariables: expect.objectContaining({ background: 'hsl(90, 22%, 12%)' }),
      }),
    );
  });

  it('uses distinct render ids for concurrent notes and theme updates in the same millisecond', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1234);
    try {
      const first = diagram();
      const second = diagram();
      await Promise.all([renderMermaidDiagrams(first), renderMermaidDiagrams(second)]);
      document.documentElement.classList.add('dark');
      await Promise.all([updateMermaidTheme(first), updateMermaidTheme(second)]);
      const ids = renderer.render.mock.calls.map(([id]) => id);
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      clock.mockRestore();
    }
  });

  it('updates every view after another view initialises the new theme', async () => {
    const first = diagram();
    const second = diagram();
    await renderMermaidDiagrams(first);
    await renderMermaidDiagrams(second);
    document.documentElement.classList.add('dark');
    await updateMermaidTheme(first);
    await updateMermaidTheme(second);
    expect(renderedTheme(first)).toBe('dark');
    expect(renderedTheme(second)).toBe('dark');
    const calls = renderer.render.mock.calls.length;
    await updateMermaidTheme(second);
    expect(renderer.render).toHaveBeenCalledTimes(calls);
    document.documentElement.classList.remove('dark');
    await updateMermaidTheme(second);
    await updateMermaidTheme(first);
    expect(renderedTheme(first)).toBe('light');
    expect(renderedTheme(second)).toBe('light');
  });

  it('updates an existing view after a new view mounts in the new theme', async () => {
    const existing = diagram();
    await renderMermaidDiagrams(existing);
    document.documentElement.classList.add('dark');
    const newlyMounted = diagram();
    await renderMermaidDiagrams(newlyMounted);
    await updateMermaidTheme(existing);
    expect(renderedTheme(existing)).toBe('dark');
    expect(renderedTheme(newlyMounted)).toBe('dark');
  });

  it('retries a failed theme update while preserving the previous diagram', async () => {
    const container = diagram();
    await renderMermaidDiagrams(container);
    document.documentElement.classList.add('dark');
    renderer.render.mockRejectedValueOnce(new Error('Invalid diagram'));
    await updateMermaidTheme(container);
    expect(renderedTheme(container)).toBe('light');
    await updateMermaidTheme(container);
    expect(renderedTheme(container)).toBe('dark');
  });
});
