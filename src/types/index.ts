/**
 * Application-wide TypeScript types.
 *
 * Prefer inferred types from the Drizzle schema where possible. This file is
 * for types that are not naturally derivable from the schema or that span
 * multiple data concerns.
 */

// ---------------------------------------------------------------------------
// Card types
// ---------------------------------------------------------------------------

export type CardType = 'basic' | 'cloze' | 'image_occlusion' | 'sequence';

export interface SequenceCard {
  id: string;
  deck_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface SequenceItem {
  id: string;
  sequence_card_id: string;
  position: number;
  content: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

// ---------------------------------------------------------------------------
// Image occlusion
// ---------------------------------------------------------------------------

export interface OcclusionRect {
  /** UUID — stable identifier for this region. */
  id: string;
  /** User-provided label shown when the region is revealed. */
  label: string;
  /** Left edge as a fraction of image width (0–1). */
  x: number;
  /** Top edge as a fraction of image height (0–1). */
  y: number;
  /** Width as a fraction of image width (0–1). */
  width: number;
  /** Height as a fraction of image height (0–1). */
  height: number;
}

export type OcclusionData = OcclusionRect[];

// LLM provider
// ---------------------------------------------------------------------------

// Forward declaration — used by Settings page (not yet implemented)
export type LlmProvider = 'gemini' | 'openai' | 'ollama';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// Forward declaration — used by Settings page (not yet implemented)
export type Theme = 'system' | 'light' | 'dark';

// Forward declaration — used by Settings page (not yet implemented)
export type AppSettings = {
  theme: Theme;
  llmProvider: LlmProvider | null;
  llmApiKey: string | null;
  llmBaseUrl: string | null;
  llmModel: string | null;
};
