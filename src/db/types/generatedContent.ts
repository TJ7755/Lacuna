/**
 * Named preset identifiers offered by the sequence editor (`src/db/sequencePresets.ts`).
 * Kept here, rather than on the presets module, so `Sequence.presetId` doesn't create a
 * types <-> sequencePresets import cycle.
 */
export type SequencePresetId = 'list' | 'poetry' | 'script' | 'speech' | 'procedure' | 'timeline';

/**
 * An overlapping-cloze sequence: an ordered list of small recallable units
 * (e.g. a numbered list, a chain of steps, or a scripted scene) from which
 * generation logic derives ordinary FSRS cards, each cueing on the preceding
 * `cueWindow` items. Sequences themselves are not studied directly.
 */
export interface Sequence {
  id: string;
  courseId: string;
  /** Same semantics as Card.primaryLessonId. */
  primaryLessonId: string | null;
  name: string;
  description?: string;
  /**
   * `list` (default, undefined reads as `list`): every item generates a
   * positional recall card. `lines`: items are speaker-tagged script lines;
   * only `mySpeaker`'s lines generate recall cards, and other speakers'
   * lines serve purely as cue context (see `mySpeaker`).
   */
  mode?: 'list' | 'lines';
  /** Ordered; stored inline as sequences are small. */
  items: SequenceItem[];
  /** Preceding items shown as cue. Default 2. */
  cueWindow: number;
  /** Optional named chunks; items reference one by index. */
  chunkLabels?: string[];
  /** Toggle for label -> value cards. Default off. */
  generateLabelCards?: boolean;
  /**
   * `lines` mode only: the speaker whose lines are the recall target. Matched
   * against `SequenceItem.speaker`. A sequence-level flag rather than a
   * per-item one, since one speaker is "mine" for the whole scene — consistent
   * with `cueWindow`/`chunkLabels` already being sequence-level settings.
   */
  mySpeaker?: string;
  /**
   * `lines` mode only: how many recited lines form one chunk in cumulative recitation
   * (Simple Learn). Undefined chunks by stanza (`SequenceItem.chunkIndex`) when any item
   * has one, otherwise by 4 lines. Integer 2-8 when set.
   */
  recitationChunkSize?: number;
  /**
   * Which named preset (`src/db/sequencePresets.ts`) the author picked at creation —
   * data-only, purely for redisplaying the right terminology/picker state when editing;
   * `mode`/`cueWindow`/`mySpeaker` above remain the fields generation actually reads.
   * Undefined for sequences created before presets existed, or if a future preset is
   * removed; falls back to inferring from `mode` (see `presetForSequence`).
   */
  presetId?: SequencePresetId;
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
}

/** A single recallable unit within a Sequence. */
export interface SequenceItem {
  /** Stable across edits — anchors generated cards. */
  id: string;
  /** Markdown; the recallable unit. */
  value: string;
  /** Optional display key (e.g. "11" for Sodium). */
  label?: string;
  /** Membership of a named chunk. */
  chunkIndex?: number;
  /** `lines` mode only: who speaks this line (e.g. a character name). */
  speaker?: string;
}

/**
 * One masked region on an occlusion diagram; anchors exactly one generated card.
 * `x`/`y`/`w`/`h` are fractions of image width/height in 0..1, never pixels — this
 * keeps masks positioned correctly under responsive image sizing.
 */
export interface OcclusionRegion {
  /** Stable across edits; anchors one generated card. */
  id: string;
  role: 'label' | 'feature';
  /** v1 only; explicit for forward-compatible geometry. */
  shape: 'rectangle';
  /** Fraction of image width, 0..1. */
  x: number;
  /** Fraction of image height, 0..1. */
  y: number;
  /** Fraction of image width, 0..1. */
  w: number;
  /** Fraction of image height, 0..1. */
  h: number;
  /** Optional; required only for typed mode and unpaired features. */
  answerText?: string;
  /** feature -> the label region that answers it. */
  pairedRegionId?: string;
  /** Optional extra shown on the back. */
  backNote?: string;
}

/**
 * An image occlusion set: a diagram plus masked regions from which generation logic
 * derives one card per region. Occlusions themselves are not studied directly.
 */
export interface Occlusion {
  id: string;
  courseId: string;
  /** Same semantics as Card.primaryLessonId. */
  primaryLessonId: string | null;
  name: string;
  /** The diagram. */
  assetHash: string;
  /** Ordered; stored inline as occlusions are small. */
  regions: OcclusionRegion[];
  /** Retain proven relationships even while a region has no generated Card. */
  regionConceptIds?: Record<string, string>;
  createdAt: number;
  /** Last mutation time. Required after schema v23; backfilled from createdAt. */
  updatedAt: number;
}
