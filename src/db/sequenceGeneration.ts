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

/** Build the front for one positional card at `position` (0-indexed) in `sequence.items`. */
function positionalFront(sequence: Sequence, items: SequenceItem[], position: number): string {
  const header = headerFor(sequence, items[position]);
  if (position === 0) {
    return `${header}\n\nFirst item?`;
  }
  const windowSize = Math.min(sequence.cueWindow, position);
  const cueItems = items.slice(position - windowSize, position).map((i) => i.value);
  const body = cueItems.length > 0 ? cueItems.join('\n\n') : 'First item?';
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
