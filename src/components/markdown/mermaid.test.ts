import { describe, expect, it } from 'vitest';
import { rehypeMermaidPlaceholder } from './mermaid';

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
