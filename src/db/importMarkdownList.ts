import { hasCloze } from '../utils/cloze';
import type { ImportParseResult, ParsedCard } from './import';

/** Keep an indented continuation inside its list item, including nested list markers. */
function listLines(input: string): string[] {
  const lines: string[] = [];
  let contentIndent = 0;
  for (const line of input.split('\n')) {
    if (contentIndent > 0 && line.trim() && line.startsWith(' '.repeat(contentIndent))) {
      lines[lines.length - 1] += `\n${line.slice(contentIndent)}`;
      continue;
    }
    const marker = /^( *)([-*+]|\d+[.)])( +)(.+)$/.exec(line);
    contentIndent = marker ? marker[1].length + marker[2].length + marker[3].length : 0;
    lines.push(line);
  }
  return lines;
}
/**
 * Parse Markdown lists (ordered or unordered) into ParsedCard[].
 *
 * Supported patterns:
 *   - Q: question / A: answer
 *   - **Q:** question / **A:** answer
 *   - Blank-line separated blocks where first line = question, second = answer.
 *
 * Pattern 2 (ordered pairs) intentionally requires an even item count so
 * each item has a front and back. Odd-count lists fall through to pattern 3.
 */
export function parseMarkdownList(input: string): ImportParseResult {
  const cards: ParsedCard[] = [];
  let skipped = 0;
  const trimmed = input.trim();
  if (!trimmed) return { cards, skipped };

  const lines = listLines(trimmed);

  // Pattern 1: List items with Q:/A: or **Q:**/**A:** inside them.
  const qaPattern =
    /^\s*[-*+]\s+(?:\*\*)?(?:Q(?:uestion)?|Front|Prompt)\s*(?:\*\*)?\s*[:.]\s*(?:\*\*)?\s*(.+)/is;
  const aaPattern =
    /^\s*[-*+]\s+(?:\*\*)?(?:A(?:nswer)?|Back|Response)\s*(?:\*\*)?\s*[:.]\s*(?:\*\*)?\s*(.+)/is;

  let currentQ: string | null = null;

  for (const line of lines) {
    const qMatch = line.match(qaPattern);
    if (qMatch) {
      if (currentQ) skipped++;
      currentQ = qMatch[1].trim();
      continue;
    }

    const aMatch = line.match(aaPattern);
    if (aMatch && currentQ) {
      const back = aMatch[1].trim();
      if (hasCloze(currentQ)) {
        cards.push({ type: 'cloze', front: currentQ, back });
      } else {
        cards.push({ type: 'front_back', front: currentQ, back });
      }
      currentQ = null;
      continue;
    }
  }
  if (currentQ) skipped++;

  if (cards.length > 0) return { cards, skipped };

  // Pattern 2: Ordered list items where odd = front, even = back.
  const orderedItems: string[] = [];

  for (const line of lines) {
    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)/s);
    if (orderedMatch) {
      orderedItems.push(orderedMatch[1].trim());
    }
  }

  if (orderedItems.length >= 2 && orderedItems.length % 2 === 0) {
    let allPaired = true;
    for (let i = 0; i < orderedItems.length; i += 2) {
      if (!orderedItems[i] || !orderedItems[i + 1]) {
        allPaired = false;
        break;
      }
    }
    if (allPaired) {
      for (let i = 0; i < orderedItems.length; i += 2) {
        const front = orderedItems[i];
        const back = orderedItems[i + 1];
        if (hasCloze(front)) {
          cards.push({ type: 'cloze', front, back });
        } else {
          cards.push({ type: 'front_back', front, back });
        }
      }
      return { cards, skipped };
    }
  }

  // Pattern 3: Blank-line separated blocks (first line = Q, remaining lines = A).
  const blocks = trimmed.split(/\n\s*\n/);
  if (blocks.length >= 2) {
    for (const block of blocks) {
      const blockLines = block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (blockLines.length >= 2) {
        const front = blockLines[0].replace(/^\s*[-*+]\s+/, '');
        const back = blockLines
          .slice(1)
          .join('\n')
          .replace(/^\s*[-*+]\s+/, '');
        if (front && back) {
          if (hasCloze(front)) {
            cards.push({ type: 'cloze', front, back });
          } else {
            cards.push({ type: 'front_back', front, back });
          }
        } else {
          skipped++;
        }
      } else if (blockLines.length === 1) {
        skipped++;
      }
    }
    return { cards, skipped };
  }

  return { cards, skipped };
}
