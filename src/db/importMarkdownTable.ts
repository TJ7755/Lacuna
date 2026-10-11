import { hasCloze } from '../utils/cloze';
import type { ImportParseResult, ParsedCard } from './import';

/** Decode pipe/backslash escape pairs and split only unescaped column separators. */
function splitMarkdownTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '');
  const cells = [''];
  for (let index = 0; index < inner.length; index++) {
    const character = inner[index];
    const next = inner[index + 1];
    if (character === '\\' && (next === '|' || next === '\\')) {
      cells[cells.length - 1] += next;
      index++;
    } else if (character === '|') {
      cells.push('');
    } else {
      cells[cells.length - 1] += character;
    }
  }
  // Only an unescaped closing separator creates this final empty cell.
  if (inner.endsWith('|') && cells[cells.length - 1] === '') cells.pop();
  return cells.map((cell) => cell.trim());
}

/** GFM delimiter cells may align their column with a leading or trailing colon. */
export function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

/**
 * Parse a GFM Markdown table into ParsedCard[].
 *
 * The first row is treated as headers. If the header contains "front"/"back"
 * (or "question"/"answer", "q"/"a", "term"/"definition"), those columns are
 * used. Otherwise column 1 = front, column 2 = back.
 *
 * A separator row (| --- | --- |) is skipped.
 */
export function parseMarkdownTable(input: string): ImportParseResult {
  const lines = input.trim().split('\n');
  const cards: ParsedCard[] = [];
  let skipped = 0;

  // A GFM delimiter identifies the real header; surrounding prose may contain pipes.
  const separatorIndex = lines.findIndex(
    (line, index) =>
      index > 0 &&
      line.includes('|') &&
      isMarkdownTableSeparator(line) &&
      lines[index - 1].includes('|'),
  );
  let tableLines = lines;
  if (separatorIndex > 0) {
    const start = separatorIndex - 1;
    const end = lines.findIndex((line, index) => index > separatorIndex && !line.includes('|'));
    tableLines = lines.slice(start, end === -1 ? undefined : end);
  }
  const pipeLines = tableLines.filter((line) => line.includes('|'));
  if (pipeLines.length < 2) return { cards, skipped };

  const headerCells = splitMarkdownTableRow(pipeLines[0]);
  const headerLower = headerCells.map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));

  const frontIdx = headerLower.findIndex((h) =>
    ['front', 'question', 'q', 'term', 'prompt'].includes(h),
  );
  const backIdx = headerLower.findIndex((h) =>
    ['back', 'answer', 'a', 'definition', 'response'].includes(h),
  );
  const tagsIdx = headerLower.findIndex((h) => ['tags', 'tag', 'labels'].includes(h));
  const typeIdx = headerLower.findIndex((h) => ['type', 'kind', 'cardtype'].includes(h));

  const colFront = frontIdx >= 0 ? frontIdx : 0;
  const colBack = backIdx >= 0 ? backIdx : headerCells.length >= 2 ? 1 : -1;

  for (let i = 1; i < pipeLines.length; i++) {
    const line = pipeLines[i];
    // Skip separator rows (| --- | --- |).
    if (isMarkdownTableSeparator(line)) continue;

    const cells = splitMarkdownTableRow(line);
    if (cells.every((c) => c.length === 0)) continue;

    const front = (cells[colFront] ?? '').trim();
    if (!front) {
      skipped++;
      continue;
    }
    const back = colBack >= 0 ? (cells[colBack] ?? '').trim() : '';
    const tagField = tagsIdx >= 0 ? (cells[tagsIdx] ?? '').trim() : '';
    const tags = tagField ? tagField.split(/[,;]\s*/).filter(Boolean) : undefined;

    const explicitType = typeIdx >= 0 ? (cells[typeIdx] ?? '').trim().toLowerCase() : '';
    if (explicitType === 'cloze' || hasCloze(front)) {
      cards.push({ type: 'cloze', front, back: back || '', ...(tags ? { tags } : {}) });
    } else if (back) {
      cards.push({ type: 'front_back', front, back, ...(tags ? { tags } : {}) });
    } else {
      skipped++;
    }
  }

  return { cards, skipped };
}
