import type { Card } from './types';

/** Parsed Anki card data before Lacuna assigns a Course-scoped Concept. */
export type ApkgCardDraft = Omit<Card, 'conceptId'>;

export interface ApkgImportResult {
  deckName: string;
  cards: ApkgCardDraft[];
  /** Supported media extracted from the APKG, keyed by original filename. */
  media: Map<string, Uint8Array>;
  /** How many Anki notes were skipped because their type is unsupported. */
  skippedNotes: number;
  /** How many Anki cards were skipped because their note was unsupported. */
  skippedCards: number;
}

export interface ApkgParseOptions {
  /** Target deck name (defaults to the first Anki deck name found). */
  deckName?: string;
  /** When true, import scheduling history (revlog). When false, start fresh. */
  importScheduling?: boolean;
}

// Kept as separate exported constants — they are used independently in error messages
// and per-check, so bundling into an object would be speculative generality.
export const MAX_APKG_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_APKG_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
export const MAX_APKG_FILE_COUNT = 5000;

export function assertApkgSize(size: number): void {
  if (size === 0) throw new Error('APKG is empty.');
  if (size > MAX_APKG_SIZE_BYTES) throw new Error(`APKG too large: ${size} bytes (max 50 MB)`);
}
