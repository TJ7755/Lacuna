import {
  detectFormat,
  parseImportAuto,
  type ImportFormat,
  type UnifiedImportOptions,
} from '../../db/importEngine';

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_CHARS = 500_000;

export const ACCEPTED_FILE_TYPES = [
  '.csv',
  '.tsv',
  '.txt',
  '.json',
  '.md',
  '.markdown',
  '.html',
  '.xml',
  '.apkg',
  'text/csv',
  'text/plain',
  'text/tab-separated-values',
  'application/json',
  'text/markdown',
  'text/html',
  'application/octet-stream',
].join(',');

// ---------------------------------------------------------------------------
// Format help text
// ---------------------------------------------------------------------------

export const FORMAT_HELP: Record<ImportFormat, string> = {
  csv: 'Comma-separated values. Each row is a card: first column is the front, second is the back, and an optional third column is tags.',
  tsv: 'Tab-separated values. Each row is a card: first column is the front, second is the back.',
  'markdown-table':
    'A Markdown table with headers. Columns named "front"/"back" (or "question"/"answer", "q"/"a", "term"/"definition") are used automatically.',
  'markdown-list':
    'A Markdown list where each item or pair of items is a card. Supports Q:/A: prefixes, ordered pairs, and blank-line separated blocks.',
  json: 'A JSON array of objects. Recognised keys (front/back, question/answer, etc.) are used automatically; otherwise the first two string values become front and back.',
  'share-code':
    'A Lacuna share code (starts with LAC). Paste the full code and it will be decoded automatically.',
  'plain-text':
    'Plain text with Q:/A: prefixes, separator-based pairs (using —, |, or tab), or blank-line separated blocks.',
  unknown: 'Paste or upload your cards. The format will be detected automatically.',
};

export function detectPanelFormat(text: string) {
  if (text.length > 100_000) return { format: 'plain-text' as ImportFormat, confidence: 0.4 };
  return detectFormat(text);
}

export function parsePanelInput(text: string, options: UnifiedImportOptions) {
  const trimmed = text.length > MAX_IMPORT_CHARS ? text.slice(0, MAX_IMPORT_CHARS) : text;
  return parseImportAuto(trimmed, options);
}
