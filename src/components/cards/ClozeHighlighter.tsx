/**
 * ClozeHighlighter — renders cloze text with deletion markers colour-coded
 * by index. Each `{{cN::...}}` token is wrapped in a styled span.
 *
 * Colours cycle through CSS custom properties --cloze-1, --cloze-2, --cloze-3
 * (defined in this component's CSS module) for c1, c2, c3 respectively.
 * Higher indices wrap around.
 */

import type { ReactNode } from 'react';
import { parseClozeTokens } from '../../lib/cloze';
import styles from './ClozeHighlighter.module.css';

const COLOUR_COUNT = 3;

function colourClass(index: number): string {
  const slot = ((index - 1) % COLOUR_COUNT) + 1;
  return styles[`cloze${slot}`] ?? '';
}

interface ClozeHighlighterProps {
  text: string;
}

export function ClozeHighlighter({ text }: ClozeHighlighterProps) {
  const tokens = parseClozeTokens(text);

  if (tokens.length === 0) {
    return <span className={styles.plain}>{text}</span>;
  }

  // Build an array of React nodes by splitting the text around each token.
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const token of tokens) {
    const tokenStart = text.indexOf(token.raw, cursor);
    if (tokenStart === -1) continue;

    // Plain text before this token.
    if (tokenStart > cursor) {
      nodes.push(
        <span key={`text-${cursor}`} className={styles.plain}>
          {text.slice(cursor, tokenStart)}
        </span>,
      );
    }

    // The deletion token itself.
    nodes.push(
      <span
        key={`token-${tokenStart}`}
        className={`${styles.token} ${colourClass(token.index)}`}
        title={`c${token.index}`}
      >
        {token.raw}
      </span>,
    );

    cursor = tokenStart + token.raw.length;
  }

  // Any trailing plain text.
  if (cursor < text.length) {
    nodes.push(
      <span key={`text-${cursor}`} className={styles.plain}>
        {text.slice(cursor)}
      </span>,
    );
  }

  return <span className={styles.root}>{nodes}</span>;
}
