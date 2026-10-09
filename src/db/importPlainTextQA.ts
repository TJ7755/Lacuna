import { hasCloze } from '../utils/cloze';
import type { ImportParseResult, ParsedCard } from './import';
import { parseMarkdownList } from './importMarkdownList';

/** Separator patterns and their lengths, ordered by specificity. */
const SEPARATORS = [
  { pattern: ' — ', length: 3 },
  { pattern: ' – ', length: 3 },
  { pattern: ' | ', length: 3 },
  { pattern: '\t', length: 1 },
] as const;

/**
 * Parse generic plain text Q&A patterns:
 *   - "Q: ... \n A: ..." or "Question: ... \n Answer: ..."
 *   - "Front: ... \n Back: ..."
 *   - Lines with " — " or " | " separator
 *   - Blank-line separated blocks (first line = Q, second = A)
 */
export function parsePlainTextQA(input: string): ImportParseResult {
  const cards: ParsedCard[] = [];
  let skipped = 0;
  const trimmed = input.trim();
  if (!trimmed) return { cards, skipped };

  const lines = trimmed.split('\n');
  const qPattern = /^\s*(?:Q(?:uestion)?|Front|Prompt|Term)\s*[:.]\s*(.+)/i;
  const aPattern = /^\s*(?:A(?:nswer)?|Back|Response|Definition)\s*[:.]\s*(.+)/i;

  let sawQuestion = false;
  let pendingFront = '';
  const pendingBack: string[] = [];
  const flush = () => {
    if (pendingFront) {
      if (pendingBack.length > 0) {
        cards.push({
          type: hasCloze(pendingFront) ? 'cloze' : 'front_back',
          front: pendingFront,
          back: pendingBack.join('\n'),
        });
      } else {
        skipped++;
      }
    }
    pendingFront = '';
    pendingBack.length = 0;
  };
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      flush();
      continue;
    }
    const qMatch = trimmedLine.match(qPattern);
    if (qMatch) {
      flush();
      sawQuestion = true;
      pendingFront = qMatch[1].trim();
      continue;
    }
    if (pendingFront) {
      // The optional answer prefix belongs to its first line. Keep subsequent
      // lines until the next question or blank-line card boundary.
      const aMatch = pendingBack.length === 0 ? trimmedLine.match(aPattern) : null;
      pendingBack.push(aMatch ? aMatch[1].trim() : trimmedLine);
    }
  }
  flush();

  if (sawQuestion) return { cards, skipped };

  // Pattern 2: Separator-based. Use the first matching separator per line,
  // tracking its length so slice() is accurate for all separator types.
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    let sepIdx = -1;
    let sepLen = 0;
    for (const { pattern, length } of SEPARATORS) {
      sepIdx = trimmedLine.indexOf(pattern);
      if (sepIdx >= 0) {
        sepLen = length;
        break;
      }
    }

    if (sepIdx > 0) {
      const front = trimmedLine.slice(0, sepIdx).trim();
      const back = trimmedLine.slice(sepIdx + sepLen).trim();
      if (front && back) {
        if (hasCloze(front)) {
          cards.push({ type: 'cloze', front, back });
        } else {
          cards.push({ type: 'front_back', front, back });
        }
        continue;
      }
    }

    skipped++;
  }

  // Plain-text block imports share the existing first-line/front, remaining-lines/back parser.
  if (cards.length === 0 && /\n\s*\n/.test(trimmed)) {
    const blocks = parseMarkdownList(trimmed);
    if (blocks.cards.length > 0) return blocks;
  }
  return { cards, skipped };
}
