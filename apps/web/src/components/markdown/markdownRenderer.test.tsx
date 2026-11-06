import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { answerMathPlugin } from './optionalMarkdown';
import { EMBED_REHYPE_PLUGINS, REHYPE_PLUGINS, REMARK_PLUGINS } from './markdownPipeline';
import { renderMarkdownToHtml } from './markdownRenderer';

const parser = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('react-markdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-markdown')>();
  parser.render.mockImplementation(actual.default);
  return { ...actual, default: parser.render };
});
const { default: FullMarkdown } =
  await vi.importActual<typeof import('react-markdown')>('react-markdown');

const plainSources = [
  'Label 1 of 4 — Cell diagram 0',
  'Nucleus answer 0',
  '1871',
  'What is a cell?',
  'Photosynthesis: energy conversion',
  'A cell (animal or plant)',
  'It is called "the nucleus"',
  "The learner's answer",
  '日本語の答え',
];

const formattedSources = [
  '',
  ' ',
  '1) Numbered list',
  '1871.',
  '- List item',
  ' Heading',
  'Trailing spaces  ',
  '    Code block',
  'First line\nSecond line',
  'First\rSecond',
  'First\tSecond',
  '**Strong**',
  '*Emphasis*',
  '~~Struck~~',
  '# Heading',
  '`Code`',
  '$x^2$',
  'https://example.com',
  'www.example.com',
  'learner@example.com',
  '[Link](https://example.com)',
  '[[Cell]]',
  '<b>Raw HTML</b>',
  'A &amp; B',
  'A < B',
  'Literal \\*asterisk',
  'A | B',
  '---',
];

describe('Markdown renderer plain text', () => {
  it.each(plainSources)('skips parsing without changing HTML for %j', (source) => {
    for (const allowEmbeds of [false, true]) {
      const expected = renderToStaticMarkup(
        <FullMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={[
            ...(allowEmbeds ? EMBED_REHYPE_PLUGINS! : REHYPE_PLUGINS!),
            answerMathPlugin,
          ]}
        >
          {source}
        </FullMarkdown>,
      );
      parser.render.mockClear();
      expect(renderMarkdownToHtml(source, allowEmbeds, false)).toBe(expected);
      expect(parser.render).not.toHaveBeenCalled();
    }
  });

  it.each(formattedSources)('keeps the full pipeline for %j', (source) => {
    const expected = renderToStaticMarkup(
      <FullMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={[...REHYPE_PLUGINS!, answerMathPlugin]}
      >
        {source}
      </FullMarkdown>,
    );
    parser.render.mockClear();
    expect(renderMarkdownToHtml(source, false, false)).toBe(expected);
    expect(parser.render).toHaveBeenCalledOnce();
  });

  it('retains optional plugin execution for plain content', () => {
    const plugin = vi.fn(() => () => {});
    parser.render.mockClear();
    expect(renderMarkdownToHtml('Optional plugin content', false, false, { math: plugin })).toBe(
      '<p>Optional plugin content</p>',
    );
    expect(parser.render).toHaveBeenCalledOnce();
    expect(plugin).toHaveBeenCalledOnce();
  });
});
