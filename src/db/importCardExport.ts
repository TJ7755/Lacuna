import { hasCloze } from '../utils/cloze';
import type { ImportParseResult, ParsedCard } from './import';

/** Recognise Lacuna's existing human-readable CSV/TSV layout without guessing other headers. */
export function parseCardExportRows(rows: string[][]): ImportParseResult | null {
  const headerIndex = rows.findIndex(
    (row) =>
      row.some((cell) => cell.trim()) &&
      !row[0]?.startsWith('# WARNING: This is a human-readable export'),
  );
  if (headerIndex < 0) return null;
  const header = rows[headerIndex];
  if (header.slice(0, 6).join(',') !== 'deck_name,deck_colour,front,back,tags,type') return null;

  const cards: ParsedCard[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => !cell.trim())) continue;
    const front = (row[2] ?? '').trim();
    const back = (row[3] ?? '').trim();
    const tags = (row[4] ?? '')
      .split(';')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const type = row[5] === 'cloze' || hasCloze(front) ? 'cloze' : 'front_back';
    if (!front || (type !== 'cloze' && !back)) {
      skipped++;
      continue;
    }
    cards.push({ type, front, back, ...(tags.length ? { tags } : {}) });
  }
  return { cards, skipped };
}
