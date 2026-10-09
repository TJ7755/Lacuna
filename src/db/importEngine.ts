// Unified import engine: auto-detects the input format and parses it into
// ParsedCard[] regardless of origin. Supports CSV/TSV, Markdown tables,
// Markdown lists, JSON arrays, Anki plain text, share codes, and generic
// Q&A text patterns.
//
// The engine is pure (no side-effects) so it can be called from any context:
// paste, file upload, clipboard detection, or share-code import.

import { hasCloze } from '../utils/cloze';
import { parseImport, splitDelimited, type ParsedCard, type ImportParseResult } from './import';
import { isMarkdownTableSeparator, parseMarkdownTable } from './importMarkdownTable';
import { parseMarkdownList } from './importMarkdownList';

export { parseMarkdownTable, parseMarkdownList };

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export type ImportFormat =
  | 'csv'
  | 'tsv'
  | 'markdown-table'
  | 'markdown-list'
  | 'json'
  | 'share-code'
  | 'plain-text'
  | 'unknown';

/** Confidence score for a detected format (0 = unlikely, 1 = certain). */
export interface FormatDetection {
  format: ImportFormat;
  confidence: number;
}

/** Human-readable label for each detected format. */
export const FORMAT_LABELS: Record<ImportFormat, string> = {
  csv: 'CSV',
  tsv: 'TSV',
  'markdown-table': 'Markdown table',
  'markdown-list': 'Markdown list',
  json: 'JSON',
  'share-code': 'Share code',
  'plain-text': 'Plain text',
  unknown: 'Unrecognised',
};

/**
 * Detect the most likely format of an input string. Returns the best guess
 * with a confidence score so the UI can show an appropriate indicator.
 */
export function detectFormat(input: string): FormatDetection {
  const trimmed = input.trim();
  if (!trimmed) return { format: 'unknown', confidence: 0 };

  // Share codes: LAC0/LAC1 (legacy base64) or LAC2/LAC3 (Base45).
  if (/^LAC[0-3]/.test(trimmed)) {
    return { format: 'share-code', confidence: 1 };
  }

  // JSON: starts with [ or { and is valid JSON.
  if (/^[[{]/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null)) {
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          if (typeof first === 'object' && first !== null) {
            const keys = Object.keys(first).map((k) => k.toLowerCase());
            const hasCardKeys = keys.some((k) =>
              ['front', 'back', 'question', 'answer', 'q', 'a', 'term', 'definition'].includes(k),
            );
            if (hasCardKeys) return { format: 'json', confidence: 0.95 };
          }
        }
        return { format: 'json', confidence: 0.6 };
      }
    } catch {
      // Not valid JSON.
    }
  }

  const lines = trimmed.split('\n');
  const nonBlankLines = lines.filter((l) => l.trim().length > 0);

  // Markdown table: non-blank lines starting with |.
  const pipeLines = nonBlankLines.filter((l) => /^\s*\|/.test(l));
  if (nonBlankLines.length >= 2 && pipeLines.length >= 2) {
    const hasSeparator = nonBlankLines.some(isMarkdownTableSeparator);
    if (hasSeparator) {
      return { format: 'markdown-table', confidence: 0.95 };
    }
    // All non-blank lines start with | but no separator.
    if (pipeLines.length === nonBlankLines.length) {
      return { format: 'markdown-table', confidence: 0.7 };
    }
  }

  // Markdown list: non-blank lines starting with - or * or 1. etc.
  const listLines = nonBlankLines.filter(
    (l) => /^\s*[-*+]\s/.test(l) || /^\s*\d+[.)]\s/.test(l),
  );
  if (listLines.length >= 2 && listLines.length >= nonBlankLines.length * 0.5) {
    return { format: 'markdown-list', confidence: 0.8 };
  }

  // Tab-separated: most non-blank lines contain tabs.
  const tabLines = nonBlankLines.filter((l) => l.includes('\t'));
  if (tabLines.length >= 1 && tabLines.length >= nonBlankLines.length * 0.5) {
    return { format: 'tsv', confidence: 0.85 };
  }

  // Explicit Q/A prefixes are stronger evidence than commas within an answer.
  const qaLines = nonBlankLines.filter((line) =>
    /^\s*(?:Q(?:uestion)?|Front|Prompt|Term)\s*[:.]/i.test(line),
  );
  const hasAnswer = nonBlankLines.some((line) =>
    /^\s*(?:A(?:nswer)?|Back|Response|Definition)\s*[:.]/i.test(line),
  );
  if (qaLines.length > 0 && hasAnswer) {
    return { format: 'plain-text', confidence: 0.8 };
  }

  // CSV: most non-blank lines contain commas in a consistent column count.
  const commaLines = nonBlankLines.filter((l) => l.includes(','));
  if (commaLines.length >= 1 && commaLines.length >= nonBlankLines.length * 0.5) {
    const counts = commaLines.map((l) => l.split(',').length);
    const maxCount = Math.max(...counts);
    if (maxCount >= 2) {
      return { format: 'csv', confidence: 0.75 };
    }
  }

  if (qaLines.length >= 2) {
    return { format: 'plain-text', confidence: 0.8 };
  }

  return { format: 'plain-text', confidence: 0.4 };
}

// ---------------------------------------------------------------------------
// JSON parser
// ---------------------------------------------------------------------------

/**
 * Parse a JSON array of card-like objects into ParsedCard[].
 *
 * Recognised key mappings:
 *   front/question/q/prompt/term -> front
 *   back/answer/a/response/definition -> back
 *   tags/labels -> tags
 *   type/kind -> type
 */
export function parseJsonImport(input: string): ImportParseResult {
  const cards: ParsedCard[] = [];
  let skipped = 0;
  const trimmed = input.trim();
  if (!trimmed) return { cards, skipped };

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return { cards, skipped };
  }

  let items: unknown[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const candidates = ['cards', 'data', 'items', 'entries', 'notes'];
    for (const key of candidates) {
      if (Array.isArray(obj[key])) {
        items = obj[key] as unknown[];
        break;
      }
    }
  } else {
    return { cards, skipped };
  }

  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      skipped++;
      continue;
    }

    const obj = item as Record<string, unknown>;
    const frontKeys = ['front', 'question', 'q', 'prompt', 'term', 'word', 'name'];
    const backKeys = ['back', 'answer', 'a', 'response', 'definition', 'meaning', 'desc'];
    const tagKeys = ['tags', 'tag', 'labels', 'label'];

    let front = '';
    let back = '';
    let tags: string[] | undefined;

    for (const key of frontKeys) {
      if (typeof obj[key] === 'string' && obj[key]) {
        front = obj[key] as string;
        break;
      }
    }
    for (const key of backKeys) {
      if (typeof obj[key] === 'string' && obj[key]) {
        back = obj[key] as string;
        break;
      }
    }
    for (const key of tagKeys) {
      const val = obj[key];
      if (Array.isArray(val)) {
        tags = val.filter((t): t is string => typeof t === 'string');
      } else if (typeof val === 'string' && val) {
        tags = val.split(/[,;]\s*/).filter(Boolean);
      }
    }

    // Fallback: if no recognised keys were matched on either side, use the
    // first two string values as front/back so arbitrary key-value JSON still works.
    if (!front && !back) {
      const stringValues = Object.values(obj).filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      );
      if (stringValues.length >= 2) {
        front = stringValues[0];
        back = stringValues[1];
      }
    }

    if (!front) {
      skipped++;
      continue;
    }

    const answerMode: Pick<ParsedCard, 'answerMode'> =
      obj.answerMode === 'type' || obj.answerMode === 'reveal' ? { answerMode: obj.answerMode } : {};
    const typeVal = typeof obj.type === 'string' ? obj.type.toLowerCase() : '';
    if (typeVal === 'cloze' || hasCloze(front)) {
      cards.push({ type: 'cloze', front, back, ...(tags ? { tags } : {}), ...answerMode });
    } else if (back) {
      cards.push({ type: 'front_back', front, back, ...(tags ? { tags } : {}), ...answerMode });
    } else {
      skipped++;
    }
  }

  return { cards, skipped };
}

// ---------------------------------------------------------------------------
// Anki plain text parser
// ---------------------------------------------------------------------------

/**
 * Parse Anki-style plain text export. Anki exports cards as tab-separated
 * with the format: front\tback\ttags (tags optional). Lines starting with #
 * are treated as comments.
 */
export function parseAnkiText(input: string): ImportParseResult {
  const cards: ParsedCard[] = [];
  let skipped = 0;
  let currentTag = '';

  for (const parts of splitDelimited(input, '\t', '\n')) {
    const trimmed = (parts[0] ?? '').trim();
    if (parts.every((part) => !part.trim()) || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith(' tagging ') || trimmed.startsWith('tags:')) {
      const tagPart = trimmed.replace(/^tags:\s*/i, '').replace(/^ tagging\s+/, '').trim();
      currentTag = tagPart;
      continue;
    }

    const front = (parts[0] ?? '').trim();
    const back = (parts[1] ?? '').trim();
    const tagField = (parts[2] ?? '').trim() || currentTag;
    const tags = tagField ? tagField.split(/\s+/).filter(Boolean) : undefined;

    if (!front) {
      skipped++;
      continue;
    }

    if (hasCloze(front)) {
      cards.push({ type: 'cloze', front, back: back || '', ...(tags ? { tags } : {}) });
    } else if (back) {
      cards.push({ type: 'front_back', front, back, ...(tags ? { tags } : {}) });
    } else {
      skipped++;
    }
  }

  return { cards, skipped };
}

// ---------------------------------------------------------------------------
// Plain text Q&A parser
// ---------------------------------------------------------------------------

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

  let pendingFront = '';
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      if (pendingFront) {
        skipped++;
        pendingFront = '';
      }
      continue;
    }

    const qMatch = trimmedLine.match(qPattern);
    if (qMatch) {
      if (pendingFront) skipped++;
      pendingFront = qMatch[1].trim();
      continue;
    }

    const aMatch = trimmedLine.match(aPattern);
    if (aMatch && pendingFront) {
      const back = aMatch[1].trim();
      if (hasCloze(pendingFront)) {
        cards.push({ type: 'cloze', front: pendingFront, back });
      } else {
        cards.push({ type: 'front_back', front: pendingFront, back });
      }
      pendingFront = '';
      continue;
    }

    // If we have a pending front and this line is not a Q, treat it as the answer
    // (for cases where A: prefix is omitted).
    if (pendingFront) {
      if (hasCloze(pendingFront)) {
        cards.push({ type: 'cloze', front: pendingFront, back: trimmedLine });
      } else {
        cards.push({ type: 'front_back', front: pendingFront, back: trimmedLine });
      }
      pendingFront = '';
      continue;
    }
  }
  if (pendingFront) skipped++;

  if (cards.length > 0) return { cards, skipped };

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

  return { cards, skipped };
}

// ---------------------------------------------------------------------------
// Unified parser
// ---------------------------------------------------------------------------

export interface UnifiedImportOptions {
  /** Override the format detection. If omitted, auto-detection is used. */
  format?: ImportFormat;
  /** Field separator for CSV/TSV fallback. */
  fieldSeparator?: string;
  /** Row separator for CSV/TSV fallback. */
  rowSeparator?: string;
}

/**
 * Parse any supported input format into ParsedCard[]. Auto-detects the format
 * unless overridden via options.format.
 *
 * Share codes should be handled by the caller via decodeShare() since they
 * require async decompression. This function returns empty cards for share codes.
 */
export function parseImportAuto(
  input: string,
  options: UnifiedImportOptions = {},
): ImportParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { cards: [], skipped: 0 };

  const format = options.format ?? detectFormat(trimmed).format;

  switch (format) {
    case 'share-code':
      return { cards: [], skipped: 0 };

    case 'markdown-table':
      return parseMarkdownTable(trimmed);

    case 'markdown-list':
      return parseMarkdownList(trimmed);

    case 'json':
      return parseJsonImport(trimmed);

    // Preserve empty leading columns; only remove the file's encoding marker.
    case 'tsv':
      return parseImport(
        input.replace(/^\uFEFF/, ''),
        options.fieldSeparator ?? '\t',
        options.rowSeparator ?? '\n',
      );

    case 'csv':
      return parseImport(
        input.replace(/^\uFEFF/, ''),
        options.fieldSeparator ?? ',',
        options.rowSeparator ?? '\n',
      );

    case 'plain-text': {
      if (trimmed.includes('\t')) {
        const ankiResult = parseAnkiText(input.replace(/^\uFEFF/, ''));
        if (ankiResult.cards.length > 0) return ankiResult;
      }
      const qaResult = parsePlainTextQA(trimmed);
      if (qaResult.cards.length > 0) return qaResult;

      return parseImport(trimmed, options.fieldSeparator ?? '\t', options.rowSeparator ?? '\n');
    }

    default:
      return parseImport(
        trimmed,
        options.fieldSeparator ?? '\t',
        options.rowSeparator ?? '\n',
      );
  }
}

