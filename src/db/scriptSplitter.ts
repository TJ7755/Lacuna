// Pure parser that turns a pasted script into speaker-tagged sequence items, for
// the lines-mode sequence editor's paste + auto-split flow. Deliberately free of
// any Dexie/IndexedDB or React dependency, mirroring sequenceGeneration.ts, so the
// splitting heuristic can be covered by fast unit tests independent of the preview
// UI that lets the author correct its output before saving.
//
// Heuristic: a line of the form "NAME: dialogue" starts a new item for that
// speaker; any following non-blank line that doesn't itself match the pattern is
// treated as a continuation of the current item's value (a wrapped line of the
// same speech). Blank lines are separators only — they never break a continuing
// speech, so a script pasted with paragraph spacing still parses cleanly.

export interface SplitScriptItem {
  id: string;
  speaker: string;
  value: string;
}

export interface SplitScriptResult {
  items: SplitScriptItem[];
  /** Distinct speakers, in order of first appearance — for the "who's mine?" picker. */
  speakers: string[];
  /** Non-blank lines seen before any "NAME: line" was recognised, so no item could claim them. */
  unmatchedLines: string[];
}

// "NAME:" — a short run of letters/digits/spaces/apostrophes/hyphens/full stops
// (covers "MRS ROBINSON", "2ND GUARD", "O'BRIEN") followed by the line's dialogue.
const SPEAKER_LINE = /^([A-Za-z0-9][A-Za-z0-9 '.-]{0,60}):\s*(.+)$/;

/**
 * Split raw pasted script text into speaker-tagged items. `makeId` is injected
 * (rather than imported from schema.ts) to keep this module dependency-free and
 * trivially testable — callers pass the app's `makeId`.
 */
export function splitScript(raw: string, makeId: () => string): SplitScriptResult {
  const items: SplitScriptItem[] = [];
  const speakers: string[] = [];
  const seenSpeakers = new Set<string>();
  const unmatchedLines: string[] = [];
  let current: SplitScriptItem | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(SPEAKER_LINE);
    if (match) {
      const speaker = match[1].trim();
      const value = match[2].trim();
      current = { id: makeId(), speaker, value };
      items.push(current);
      if (!seenSpeakers.has(speaker)) {
        seenSpeakers.add(speaker);
        speakers.push(speaker);
      }
    } else if (current) {
      current.value = `${current.value}\n${line}`;
    } else {
      unmatchedLines.push(line);
    }
  }

  return { items, speakers, unmatchedLines };
}
