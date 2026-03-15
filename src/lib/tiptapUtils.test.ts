import { describe, it, expect } from 'vitest';
import { tiptapToPlainText } from './tiptapUtils';

describe('tiptapToPlainText', () => {
  it('returns empty string for empty document', () => {
    const doc = { type: 'doc', content: [] };
    expect(tiptapToPlainText(doc)).toBe('');
  });

  it('renders plain paragraph text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    };

    expect(tiptapToPlainText(doc)).toBe('Hello world');
  });

  it('preserves paragraph breaks as blank lines', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second paragraph' }],
        },
      ],
    };

    expect(tiptapToPlainText(doc)).toBe('First paragraph\n\nSecond paragraph');
  });

  it('renders heading text as plain text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Title' }],
        },
      ],
    };

    expect(tiptapToPlainText(doc)).toBe('Title');
  });

  it('renders code blocks with surrounding blank lines', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before code' }] },
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'const x = 1;\nconsole.log(x);' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'After code' }] },
      ],
    };

    expect(tiptapToPlainText(doc)).toBe(
      'Before code\n\nconst x = 1;\nconsole.log(x);\n\nAfter code',
    );
  });

  it('renders inline maths using its formula text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Formula: ' },
            { type: 'inlineMath', attrs: { formula: 'E = mc^2' } },
          ],
        },
      ],
    };

    expect(tiptapToPlainText(doc)).toBe('Formula: E = mc^2');
  });

  it('handles mixed content', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Physics' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Energy relation: ' },
            { type: 'inlineMath', attrs: { formula: 'E = mc^2' } },
          ],
        },
        {
          type: 'codeBlock',
          content: [{ type: 'text', text: 'print("hello")' }],
        },
      ],
    };

    expect(tiptapToPlainText(doc)).toBe(
      'Physics\n\nEnergy relation: E = mc^2\n\nprint("hello")',
    );
  });
});
