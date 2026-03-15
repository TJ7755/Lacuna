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

export type CardType = 'basic' | 'cloze' | 'image_occlusion';

// ---------------------------------------------------------------------------
// Review ratings — mirrors FSRS's Rating enum
// ---------------------------------------------------------------------------

export type ReviewRating = 1 | 2 | 3 | 4; // Again | Hard | Good | Easy

// ---------------------------------------------------------------------------
// LLM provider
// ---------------------------------------------------------------------------

export type LlmProvider = 'gemini' | 'openai' | 'ollama';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type Theme = 'system' | 'light' | 'dark';

export type AppSettings = {
  theme: Theme;
  llmProvider: LlmProvider | null;
  llmApiKey: string | null;
  llmBaseUrl: string | null;
  llmModel: string | null;
};
