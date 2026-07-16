// Pure generation and regeneration logic for overlapping-cloze Sequences.
//
// A Sequence never itself sits in a study session — it is a source document that
// derives ordinary `front_back` FSRS cards. This module is deliberately free of any
// Dexie/IndexedDB access so its correctness (the risk centre of this feature) can be
// covered by fast, exhaustive unit tests before any UI or repository code exists.
// Repository wiring (persisting the output of `diffRegeneration`) is a later task.
//
// -----------------------------------------------------------------------------
// Front format
// -----------------------------------------------------------------------------
// Every generated positional card's `front` is two parts joined by a single blank
// line (`\n\n`):
//
//   1. A header line: `**{sequence.name}**`, or `**{sequence.name} — {chunkLabel}**`
//      when the item belongs to a chunk.
//   2. A body, which is either:
//      - the literal text `First item?` for the first item in the sequence, or
//      - the preceding cue items' values, each its own paragraph (joined by `\n\n`),
//        for every later item.
//
// This keeps the card readable as plain Markdown today (rendered via the generic
// `front_back` path in CardContent/MarkdownView) while remaining machine-separable:
// `parseSequenceFront` recovers the header and body deterministically by splitting on
// the first blank line, so a future cue-aware renderer can style the header and cue
// paragraphs distinctly from the (implied) "what comes next?" prompt without any
// change to the Card shape. `back` is always the item's own value.
//
// -----------------------------------------------------------------------------
// Lines mode
// -----------------------------------------------------------------------------
// Same machinery, different skin: `sequence.mode === 'lines'` marks items as lines
// rather than a plain ordered list. Items are speaker-tagged (a scripted scene) or not
// (a poem, a solo speech — see `src/db/sequencePresets.ts`). Only the item whose
// `speaker` matches `sequence.mySpeaker` generates a card when it *has* a speaker;
// speakerless items are always mine, since there's no other speaker to disambiguate
// them from. Non-mine speaker-tagged lines never get their own card but still count
// towards the cue window, so a scene reads like a script: cue paragraphs render as
// `NAME: line` (see `cueText`) when the item has a speaker, or bare values otherwise.
// The first-item prompt reads "First line?" instead of "First item?".
// Everything else — chunking, label cards, regeneration/diffing — is unchanged.
//
// -----------------------------------------------------------------------------
// Card identity
// -----------------------------------------------------------------------------
// Positional cards use `Card.sequenceItemId = item.id` directly.
// Label cards (generated when `sequence.generateLabelCards` is true and an item has
// a `label`) use `Card.sequenceItemId = ${item.id}${LABEL_CARD_SUFFIX}` — a stable,
// deterministic suffix — so they never collide with the positional card generated
// from the same item, and so `isLabelCardId`/regeneration can tell the two kinds
// apart from the id alone.

import type { Card, CardType, Sequence, SequenceItem } from './types';

/** Suffix appended to a SequenceItem.id to derive its label card's sequenceItemId. */
export const LABEL_CARD_SUFFIX = '::label';

/** Whether a sequenceItemId belongs to a label card rather than a positional card. */
export function isLabelCardId(sequenceItemId: string): boolean {
  return sequenceItemId.endsWith(LABEL_CARD_SUFFIX);
}

/** Strip the label-card suffix (if present) to recover the underlying SequenceItem id. */
export function baseItemId(sequenceItemId: string): string {
  return isLabelCardId(sequenceItemId)
    ? sequenceItemId.slice(0, -LABEL_CARD_SUFFIX.length)
    : sequenceItemId;
}

/** Find the Sequence that owns a generated card's `sequenceItemId` among a list of candidates.
 *  Used by management surfaces to resolve which sequence a generated card belongs to (for
 *  grouping, badging, and linking back to the sequence editor) without a dedicated index. */
export function sequenceForItemId(
  sequences: Sequence[],
  sequenceItemId: string,
): Sequence | undefined {
  const itemId = baseItemId(sequenceItemId);
  return sequences.find((sequence) => sequence.items.some((item) => item.id === itemId));
}

/** The generated card type. Plain front/back is correct here: the cue/answer split
 *  maps directly onto front/back, and cloze notation would add nothing since only
 *  one item is ever hidden per card. */
const GENERATED_CARD_TYPE: CardType = 'front_back';

/** The shape a generated card takes before persistence assigns it an id and FSRS defaults. */
export interface GeneratedCardPayload {
  type: CardType;
  front: string;
  back: string;
  /** Anchors the card to its SequenceItem (positional) or item+label (label card). */
  sequenceItemId: string;
  courseId: string;
  primaryLessonId: string | null;
}

/** A single field-level change to an existing generated card. Never includes FSRS/scheduling fields. */
export interface GeneratedCardUpdate {
  id: string;
  front?: string;
  back?: string;
}

export interface RegenerationDiff {
  creates: GeneratedCardPayload[];
  updates: GeneratedCardUpdate[];
  deletes: string[];
}

function chunkLabelFor(sequence: Sequence, item: SequenceItem): string | undefined {
  if (item.chunkIndex === undefined) return undefined;
  return sequence.chunkLabels?.[item.chunkIndex];
}

function headerFor(sequence: Sequence, item: SequenceItem): string {
  const label = chunkLabelFor(sequence, item);
  return label ? `**${sequence.name} — ${label}**` : `**${sequence.name}**`;
}

/** Whether an item is "mine" and therefore generates a recall card. In `list` mode
 *  (the default) every item is mine; in `lines` mode a speakerless item (no `speaker`
 *  set at all — poetry/verse, a solo speech, or an unattributed line) is always mine,
 *  since there is no other speaker to disambiguate it from. Only a speaker-tagged item
 *  is filtered against `sequence.mySpeaker` — other speakers' lines are cue-only context. */
function isMyLine(sequence: Sequence, item: SequenceItem): boolean {
  if (sequence.mode !== 'lines') return true;
  if (item.speaker === undefined) return true;
  return item.speaker === sequence.mySpeaker;
}

const firstItemPrompt = (sequence: Sequence) => (sequence.mode === 'lines' ? 'First line?' : 'First item?');

/** Render one cue item's text. In `lines` mode a speaker-tagged item reads like a
 *  script line ("NAME: line"), matching how cue lines display by default. */
function cueText(sequence: Sequence, item: SequenceItem): string {
  if (sequence.mode === 'lines' && item.speaker) {
    return `${item.speaker}: ${item.value}`;
  }
  return item.value;
}

/** Build the front for one positional card at `position` (0-indexed) in `sequence.items`. */
function positionalFront(sequence: Sequence, items: SequenceItem[], position: number): string {
  const header = headerFor(sequence, items[position]);
  const prompt = firstItemPrompt(sequence);
  if (position === 0) {
    return `${header}\n\n${prompt}`;
  }
  const windowSize = Math.min(sequence.cueWindow, position);
  const cueItems = items.slice(position - windowSize, position).map((i) => cueText(sequence, i));
  const body = cueItems.length > 0 ? cueItems.join('\n\n') : prompt;
  return `${header}\n\n${body}`;
}

/** Recover the header/body split of a generated positional front. Inverse of `positionalFront`'s join. */
export function parseSequenceFront(front: string): { header: string; body: string } {
  const separatorIndex = front.indexOf('\n\n');
  if (separatorIndex === -1) return { header: front, body: '' };
  return {
    header: front.slice(0, separatorIndex),
    body: front.slice(separatorIndex + 2),
  };
}

function labelFront(item: SequenceItem): string {
  return `${item.label} → ?`;
}

/**
 * Deterministically generate every card payload for a sequence: one positional card
 * per item, plus (when enabled and the item has a label) one label→value card.
 */
export function generateCards(sequence: Sequence): GeneratedCardPayload[] {
  const { items } = sequence;
  const payloads: GeneratedCardPayload[] = [];

  items.forEach((item, position) => {
    if (!isMyLine(sequence, item)) return;

    payloads.push({
      type: GENERATED_CARD_TYPE,
      front: positionalFront(sequence, items, position),
      back: item.value,
      sequenceItemId: item.id,
      courseId: sequence.courseId,
      primaryLessonId: sequence.primaryLessonId,
    });

    if (sequence.generateLabelCards && item.label) {
      payloads.push({
        type: GENERATED_CARD_TYPE,
        front: labelFront(item),
        back: item.value,
        sequenceItemId: `${item.id}${LABEL_CARD_SUFFIX}`,
        courseId: sequence.courseId,
        primaryLessonId: sequence.primaryLessonId,
      });
    }
  });

  return payloads;
}

/**
 * Diff a sequence's freshly-generated cards against its previously-generated cards
 * (i.e. `existingCards` should already be filtered by the caller to the cards whose
 * `sequenceItemId` was generated from this sequence, positional or label). Keyed on
 * the stable `sequenceItemId`, never on array position, so edits/inserts/reorders/
 * deletes/label-toggles all fall out of one straightforward key comparison:
 *
 *  - key only in the desired set  -> create
 *  - key only in the existing set -> delete
 *  - key in both, front/back differ -> update (content fields only; FSRS/scheduling
 *    fields on the existing card, e.g. stability/difficulty/history, are left untouched
 *    by omitting them from the update entirely)
 */
export function diffRegeneration(sequence: Sequence, existingCards: Card[]): RegenerationDiff {
  const desired = generateCards(sequence);
  const desiredByKey = new Map(desired.map((payload) => [payload.sequenceItemId, payload]));
  const existingByKey = new Map(
    existingCards
      .filter((card): card is Card & { sequenceItemId: string } => card.sequenceItemId !== undefined)
      .map((card) => [card.sequenceItemId, card]),
  );

  const creates: GeneratedCardPayload[] = [];
  const updates: GeneratedCardUpdate[] = [];
  const deletes: string[] = [];

  for (const [key, payload] of desiredByKey) {
    const existing = existingByKey.get(key);
    if (!existing) {
      creates.push(payload);
      continue;
    }
    const update: GeneratedCardUpdate = { id: existing.id };
    let changed = false;
    if (existing.front !== payload.front) {
      update.front = payload.front;
      changed = true;
    }
    if (existing.back !== payload.back) {
      update.back = payload.back;
      changed = true;
    }
    if (changed) updates.push(update);
  }

  for (const [key, existing] of existingByKey) {
    if (!desiredByKey.has(key)) deletes.push(existing.id);
  }

  return { creates, updates, deletes };
}
