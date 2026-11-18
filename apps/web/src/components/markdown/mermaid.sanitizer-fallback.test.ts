import { expect, it, vi } from 'vitest';
import { renderMermaidDiagrams } from './mermaid';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg><text>Diagram</text></svg>' })),
  },
}));
vi.mock('dompurify', () => ({
  default: () => {
    throw new Error('Sanitiser binding failed');
  },
}));

it('keeps diagram source readable when the sanitiser cannot bind to the browser', async () => {
  const container = document.createElement('div');
  container.innerHTML = '<pre class="lacuna-mermaid">flowchart TD\n A--&gt;B</pre>';
  await renderMermaidDiagrams(container);
  expect(container.querySelector('svg')).toBeNull();
  expect(container.querySelector('pre')).toHaveTextContent('flowchart TD A-->B');
  expect(container.querySelector('[data-mermaid-rendered]')).toBeNull();
});
