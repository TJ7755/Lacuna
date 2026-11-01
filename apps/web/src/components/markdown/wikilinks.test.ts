import { describe, expect, it } from 'vitest';
import { parseWikilinkText, rehypeWikilinks } from './wikilinks';

describe('parseWikilinkText', () => {
  it('parses a plain [[note]] reference', () => {
    expect(parseWikilinkText('See [[01_Peacemaking]] today')).toEqual([
      'See ',
      { target: '01_Peacemaking', label: '01_Peacemaking' },
      ' today',
    ]);
  });

  it('parses a [[target|label]] reference', () => {
    expect(parseWikilinkText('See [[note-id|Custom label]]')).toEqual(
      ['See ', { target: 'note-id', label: 'Custom label' }, ''].filter((part) => part !== ''),
    );
  });

  it('leaves empty brackets as literal text', () => {
    expect(parseWikilinkText('See [[]] today')).toEqual(['See [[]] today']);
  });
});

describe('rehypeWikilinks', () => {
  it('rewrites text nodes to pills and skips code blocks', () => {
    const tree = {
      children: [
        { type: 'text', value: 'See [[My Note]]' },
        {
          type: 'element',
          tagName: 'pre',
          children: [
            {
              type: 'element',
              tagName: 'code',
              children: [{ type: 'text', value: '[[My Note]]' }],
            },
          ],
        },
      ],
    };
    rehypeWikilinks()(tree);
    const elements = tree.children as unknown as Array<{
      tagName?: string;
      properties?: { className?: string[] };
      children?: Array<{ children?: Array<{ value?: string }> }>;
    }>;
    const pill = elements.find((child) => child.tagName === 'span');
    expect(pill).toBeDefined();
    expect(pill!.properties!.className).toContain('lacuna-wikilink');
    const pre = elements.find((child) => child.tagName === 'pre');
    const code = pre!.children![0].children![0];
    expect(code.value).toBe('[[My Note]]');
  });
});
