import { describe, expect, it, vi } from 'vitest';
import { rehypeMermaidPlaceholder, sanitizeDiagramSvg } from './mermaid';

// DOMPurify cannot run under happy-dom, so the module is stubbed with canned
// responses (no filtering logic of its own): tainted input resolves to a fixed
// clean diagram, anything else passes through. Real scrubbing behaviour is
// verified in a real browser.
vi.mock('dompurify', () => ({
  default: {
    sanitize: (dirty: string): string =>
      dirty.includes('<script') || dirty.includes('onclick')
        ? '<svg><g><text>hi</text></g></svg>'
        : dirty,
  },
}));

describe('rehypeMermaidPlaceholder', () => {
  it('tags pre blocks wrapping language-mermaid code', () => {
    const tree = {
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties: { className: [] as string[] },
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: { className: ['language-mermaid'] },
              children: [{ type: 'text', value: 'flowchart TD\n  A-->B' }],
            },
          ],
        },
        {
          type: 'element',
          tagName: 'pre',
          properties: { className: [] as string[] },
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: { className: ['language-js'] },
              children: [{ type: 'text', value: 'const a = 1;' }],
            },
          ],
        },
      ],
    };
    rehypeMermaidPlaceholder()(tree);
    const first = tree.children[0] as unknown as {
      properties: { className: string[] };
    };
    const second = tree.children[1] as unknown as {
      properties: { className: string[] };
    };
    expect(first.properties.className).toContain('lacuna-mermaid');
    expect(second.properties.className).not.toContain('lacuna-mermaid');
  });
});

describe('sanitizeDiagramSvg', () => {
  // DOMPurify cannot run under happy-dom, so the module is mocked here to prove
  // the wiring: rendered SVG passes through the sanitizer before reaching the
  // document. Real scrubbing behaviour is verified in a real browser.
  it('passes rendered SVG through the sanitizer', async () => {
    const clean = await sanitizeDiagramSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><g class="node" onclick="steal()"><text>hi</text></g></svg>',
    );
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('<g');
    expect(clean).toContain('hi');
  });
});
