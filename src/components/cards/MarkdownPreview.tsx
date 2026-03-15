/**
 * MarkdownPreview — renders Markdown with KaTeX maths and DOMPurify sanitisation.
 *
 * Inline maths: `$...$`
 * Block maths:  `$$...$$`
 *
 * Processing pipeline:
 * 1. Replace math expressions with unique tokens
 * 2. Parse Markdown with `marked`
 * 3. Restore tokens with KaTeX-rendered HTML
 * 4. Sanitise the full HTML with DOMPurify
 */

import { useMemo } from 'react';
import { marked } from 'marked';
import katex from 'katex';
import DOMPurify from 'dompurify';
import styles from './MarkdownPreview.module.css';

// Configure marked — synchronous, no async extensions.
marked.setOptions({ async: false } as Parameters<typeof marked.setOptions>[0]);

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

function renderToHtml(markdown: string): string {
  const mathMap = new Map<string, string>();
  let counter = 0;

  // Replace block math first ($$...$$) to avoid matching $ inside $$.
  let processed = markdown.replace(
    /\$\$([\s\S]+?)\$\$/g,
    (_match, math: string) => {
      const token = `LACUNA_MATH_BLOCK_${counter++}_`;
      mathMap.set(
        token,
        katex.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
        }),
      );
      return token;
    },
  );

  // Replace inline math ($...$) — single line, non-empty.
  processed = processed.replace(/\$([^\n$]+?)\$/g, (_match, math: string) => {
    const token = `LACUNA_MATH_INLINE_${counter++}_`;
    mathMap.set(
      token,
      katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
      }),
    );
    return token;
  });

  // Parse Markdown.
  let html = marked.parse(processed) as string;

  // Restore math tokens.
  for (const [token, rendered] of mathMap) {
    html = html.replace(token, rendered);
  }

  // Sanitise — allow KaTeX inline styles and aria attributes.
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['aria-hidden', 'style', 'class'],
    FORCE_BODY: false,
  });
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  const html = useMemo(() => renderToHtml(content), [content]);

  return (
    <div
      className={`${styles.preview} ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
