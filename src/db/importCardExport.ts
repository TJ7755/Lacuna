import { hasCloze } from '../utils/cloze';
import type { ImportParseResult, ParsedCard } from './import';

/**
 * Spreadsheets run a cell starting with one of these as a formula. The CSV/TSV export
 * prefixes such cells with an apostrophe so they show as text; this importer strips it.
 */
export const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Undo the export's formula guard so `=x` survives a round trip unchanged. */
function unguardFormula(cell: string | undefined): string {
  const value = cell ?? '';
  return value.startsWith("'") && SPREADSHEET_FORMULA_PREFIX.test(value.slice(1))
    ? value.slice(1)
    : value;
}

/** Recognise Lacuna's existing human-readable CSV/TSV layout without guessing other headers. */
export function findCardExportHeaderIndex(rows: Iterable<string[]>): number {
  let index = 0;
  for (const row of rows) {
    if (
      row.some((cell) => cell.trim()) &&
      !row[0]?.startsWith('# WARNING: This is a human-readable export')
    ) {
      return row.slice(0, 6).join(',') === 'deck_name,deck_colour,front,back,tags,type'
        ? index
        : -1;
    }
    index++;
  }
  return -1;
}

export function parseCardExportRows(rows: string[][]): ImportParseResult | null {
  const headerIndex = findCardExportHeaderIndex(rows);
  if (headerIndex < 0) return null;

  const cards: ParsedCard[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => !cell.trim())) continue;
    const front = unguardFormula(row[2]).trim();
    const back = unguardFormula(row[3]).trim();
    const tags = unguardFormula(row[4])
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
