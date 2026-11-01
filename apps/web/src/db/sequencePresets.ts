// Named sequence presets: a thin, data-only layer over the two Sequence generation
// modes (`list`/`lines`, see sequenceGeneration.ts). A preset is nothing more than a
// bundle of sensible defaults and editor terminology for one authoring scenario — it
// introduces no new generation behaviour, storage, or machinery. `SequenceEditor` uses
// this table to render a preset picker in place of the old bare mode picker and to seed
// `mode`/`cueWindow`/terminology on creation; `Sequence.presetId` (additive, optional)
// persists which preset was picked purely so editing a sequence later can redisplay the
// same terminology, without changing what generation reads.
//
// Two presets in the brief — "Speech / presentation" (one speaker) and "Poetry / verse"
// (no speakers) — are mechanically identical once lines-mode filtering treats a
// speakerless line as always "mine" (see `isMyLine` in sequenceGeneration.ts): with zero
// or one speaker, every line is the reciter's, so nothing here ever sets `mySpeaker`
// for either. They stay as two rows purely because the table makes that free — same
// `mode`/`usesSpeakers`/`cueWindow`, distinguished only by name and description.

import type { SequencePresetId } from './types';

export interface SequencePreset {
  id: SequencePresetId;
  name: string;
  description: string;
  mode: 'list' | 'lines';
  /**
   * Whether this preset's items are tagged with a speaker and the editor should offer
   * the "my speaker" picker (only relevant in `lines` mode). False for poetry/speech,
   * whose lines have no speaker at all — every line is "mine" (see module comment).
   */
  usesSpeakers: boolean;
  defaultCueWindow: number;
  terminology: {
    /** Singular noun for one item, e.g. "item", "line", "step". */
    item: string;
    /** Capitalised plural, used as the items-list section heading. */
    itemPlural: string;
    /** Noun for a named chunk, e.g. "Chunk", "Scene", "Era". */
    chunkLabel: string;
  };
}

const listTerminology = (item: string, itemPlural: string, chunkLabel: string) => ({
  item,
  itemPlural,
  chunkLabel,
});

/** Every preset the sequence editor offers, in picker display order. */
export const SEQUENCE_PRESETS: readonly SequencePreset[] = [
  {
    id: 'list',
    name: 'Ordered list',
    description: 'An ordered list — each item cues on the ones before it.',
    mode: 'list',
    usesSpeakers: false,
    defaultCueWindow: 2,
    terminology: listTerminology('item', 'Items', 'Chunk'),
  },
  {
    id: 'poetry',
    name: 'Poetry / verse',
    description: 'A poem or verse — each line cues on the ones before it.',
    mode: 'lines',
    usesSpeakers: false,
    defaultCueWindow: 2,
    terminology: listTerminology('line', 'Lines', 'Verse'),
  },
  {
    id: 'script',
    name: 'Script / dialogue',
    description: 'A scripted scene — only your lines are recalled; other speakers cue them.',
    mode: 'lines',
    usesSpeakers: true,
    defaultCueWindow: 2,
    terminology: listTerminology('line', 'Lines', 'Scene'),
  },
  {
    id: 'speech',
    name: 'Speech / presentation',
    description: 'A speech or talk you deliver solo — each line cues on the ones before it.',
    mode: 'lines',
    usesSpeakers: false,
    defaultCueWindow: 2,
    terminology: listTerminology('line', 'Lines', 'Section'),
  },
  {
    id: 'procedure',
    name: 'Procedure / checklist',
    description: 'A sequence of steps — each step cues on the ones before it.',
    mode: 'list',
    usesSpeakers: false,
    defaultCueWindow: 2,
    terminology: listTerminology('step', 'Steps', 'Phase'),
  },
  {
    id: 'timeline',
    name: 'Timeline',
    description: 'A chronology of events — group them into named eras or periods.',
    mode: 'list',
    usesSpeakers: false,
    defaultCueWindow: 2,
    terminology: listTerminology('event', 'Events', 'Era'),
  },
];

const PRESETS_BY_ID: ReadonlyMap<SequencePresetId, SequencePreset> = new Map(
  SEQUENCE_PRESETS.map((preset) => [preset.id, preset]),
);

/** Look up a preset by id, falling back to `list` for an unknown/removed id. */
export function getPreset(id: SequencePresetId | undefined): SequencePreset {
  return (id && PRESETS_BY_ID.get(id)) || PRESETS_BY_ID.get('list')!;
}

/**
 * The preset a sequence displays as when it predates `presetId` (or the id no longer
 * resolves): infer the closest preset from `mode`/`mySpeaker` alone. `lines` mode with
 * no `mySpeaker` reads as poetry (the more common speakerless case) rather than script.
 */
export function presetForSequence(sequence: {
  presetId?: SequencePresetId;
  mode?: 'list' | 'lines';
  mySpeaker?: string;
}): SequencePreset {
  if (sequence.presetId) return getPreset(sequence.presetId);
  if (sequence.mode === 'lines') return getPreset(sequence.mySpeaker ? 'script' : 'poetry');
  return getPreset('list');
}
