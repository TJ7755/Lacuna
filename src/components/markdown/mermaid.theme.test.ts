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
  resetMermaidInitialisation();
  renderer.initialize.mockImplementation((config) => {
    renderer.theme = config.themeVariables.background === '#141311' ? 'dark' : 'light';
  });
  renderer.render.mockImplementation(async () => ({
    svg: `<svg data-palette="${renderer.theme}"><text>Diagram</text></svg>`,
  }));
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.classList.remove('dark');
});

describe('Mermaid theme updates', () => {
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
