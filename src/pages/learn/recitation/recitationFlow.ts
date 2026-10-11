// Cumulative recitation: the Simple Learn loop for lines-mode sequences. One new line is
// presented at a time, and the learner recites every unlocked line of the current chunk
// from memory before the next is revealed (the progressive-part method). Once a chunk is
// complete, everything learnt so far is recited once from the top; an error there sends
// the learner back to the chunk containing it. Pure and React-free so every transition is
// unit tested.

import type { Card, Sequence, SequenceItem } from '../../../db/types';

export const DEFAULT_RECITATION_CHUNK_SIZE = 4;
export const MIN_RECITATION_CHUNK_SIZE = 2;
export const MAX_RECITATION_CHUNK_SIZE = 8;

export interface RecitationLine {
  itemId: string;
  value: string;
  speaker?: string;
  /** False for another speaker's line: shown as a cue, never recited. */
  mine: boolean;
}

export interface RecitationPlan {
  lines: RecitationLine[];
  /** Each chunk is a contiguous run of line indices holding at least one mine line. */
  chunks: number[][];
}

function isMine(sequence: Sequence, item: SequenceItem): boolean {
  return item.speaker === undefined || item.speaker === sequence.mySpeaker;
}

/** Whether a sequence chunks by stanza by default (any item belongs to a named chunk). */
export function hasStanzas(sequence: Pick<Sequence, 'items'>): boolean {
  return sequence.items.some((item) => item.chunkIndex !== undefined);
}

/**
 * Split a lines-mode sequence into recitation chunks. An explicit
 * `recitationChunkSize` counts mine lines; otherwise stanzas win when present, and
 * plain sequences fall back to the default size. Leading cue lines join the chunk of
 * the next mine line; trailing cue lines join the last chunk.
 */
export function recitationPlan(sequence: Sequence): RecitationPlan {
  const lines = sequence.items.map((item) => ({
    itemId: item.id,
    value: item.value,
    ...(item.speaker ? { speaker: item.speaker } : {}),
    mine: isMine(sequence, item),
  }));
  const byStanza = sequence.recitationChunkSize === undefined && hasStanzas(sequence);
  const size = sequence.recitationChunkSize ?? DEFAULT_RECITATION_CHUNK_SIZE;

  const chunks: number[][] = [];
  let current: number[] = [];
  let mineInCurrent = 0;
  sequence.items.forEach((item, index) => {
    const mine = lines[index].mine;
    const startsNew = byStanza
      ? mineInCurrent > 0 && item.chunkIndex !== sequence.items[index - 1].chunkIndex
      : mine && mineInCurrent === size;
    if (startsNew) {
      chunks.push(current);
      current = [];
      mineInCurrent = 0;
    }
    current.push(index);
    if (mine) mineInCurrent += 1;
  });
  if (current.length > 0) {
    if (mineInCurrent > 0 || chunks.length === 0) chunks.push(current);
    else chunks[chunks.length - 1].push(...current);
  }
  return { lines, chunks: chunks.filter((chunk) => chunk.some((i) => lines[i].mine)) };
}

export type RecitationStep =
  /** Learning `chunk`: the first `unlocked` mine lines are recited. Passing the full
   *  chunk recites everything up to `joinTarget` from the top. */
  | { kind: 'build'; chunk: number; unlocked: number; joinTarget: number }
  /** Reciting chunks 0..upTo from the top. */
  | { kind: 'join'; upTo: number }
  | { kind: 'done' };

export interface RecitationState {
  step: RecitationStep;
  /** 'present' shows the newly unlocked line; 'recall' hides everything. */
  phase: 'present' | 'recall';
}

function mineCount(plan: RecitationPlan, chunk: number): number {
  return plan.chunks[chunk].filter((i) => plan.lines[i].mine).length;
}

function startChunk(chunk: number): RecitationState {
  return { step: { kind: 'build', chunk, unlocked: 1, joinTarget: chunk }, phase: 'present' };
}

/** Start at the first chunk with a line not yet mastered this session. */
export function initialRecitationState(
  plan: RecitationPlan,
  mastered: ReadonlySet<string> = new Set(),
): RecitationState {
  const chunk = plan.chunks.findIndex((indices) =>
    indices.some((i) => plan.lines[i].mine && !mastered.has(plan.lines[i].itemId)),
  );
  return chunk === -1 ? { step: { kind: 'done' }, phase: 'recall' } : startChunk(chunk);
}

/** Whether a saved state still fits the plan; an edited sequence can invalidate it. */
export function isRecitationStateFor(plan: RecitationPlan, value: unknown): value is RecitationState {
  if (typeof value !== 'object' || value === null) return false;
  const { step, phase } = value as Partial<RecitationState>;
  if (phase !== 'present' && phase !== 'recall') return false;
  if (typeof step !== 'object' || step === null) return false;
  const last = plan.chunks.length - 1;
  const index = (n: unknown, min: number, max: number) =>
    Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
  if (step.kind === 'join') return phase === 'recall' && index(step.upTo, 1, last);
  if (step.kind !== 'build' || !index(step.chunk, 0, last)) return false;
  return index(step.unlocked, 1, mineCount(plan, step.chunk)) && index(step.joinTarget, step.chunk, last);
}

/** Line indices the learner sees for this step, cue lines included, in order. */
export function targetLines(plan: RecitationPlan, step: RecitationStep): number[] {
  if (step.kind === 'done') return [];
  if (step.kind === 'join') return plan.chunks.slice(0, step.upTo + 1).flat();
  const indices = plan.chunks[step.chunk];
  const result: number[] = [];
  let mine = 0;
  for (const index of indices) {
    if (plan.lines[index].mine) {
      if (mine === step.unlocked) break;
      mine += 1;
    }
    result.push(index);
  }
  return result;
}

/** The newly unlocked line and the cue lines leading into it, for the present phase. */
export function presentedLines(plan: RecitationPlan, step: RecitationStep): number[] {
  if (step.kind !== 'build') return [];
  const target = targetLines(plan, step);
  let start = target.length - 1;
  while (start > 0 && !plan.lines[target[start - 1]].mine) start -= 1;
  return target.slice(start);
}

export interface RecitationOutcome {
  state: RecitationState;
  /** Item ids whose chunks were mastered by this check. */
  mastered: string[];
}

function mineIds(plan: RecitationPlan, chunks: number[][]): string[] {
  return chunks.flat().filter((i) => plan.lines[i].mine).map((i) => plan.lines[i].itemId);
}

/**
 * Apply a self-marked check. `wrong` holds the item ids the learner marked wrong; an
 * empty set is a pass. A failed build is retried unchanged; a failed join returns to
 * the chunk holding the first wrong line, fully unlocked.
 */
export function advanceRecitation(
  plan: RecitationPlan,
  state: RecitationState,
  wrong: ReadonlySet<string>,
): RecitationOutcome {
  const { step } = state;
  if (step.kind === 'done') return { state, mastered: [] };
  if (state.phase === 'present') return { state: { step, phase: 'recall' }, mastered: [] };

  if (wrong.size > 0) {
    if (step.kind === 'build') return { state: { step, phase: 'recall' }, mastered: [] };
    const chunk = plan.chunks.findIndex((indices) =>
      indices.some((i) => wrong.has(plan.lines[i].itemId)),
    );
    const back = Math.max(0, Math.min(chunk, step.upTo));
    return {
      state: {
        step: { kind: 'build', chunk: back, unlocked: mineCount(plan, back), joinTarget: step.upTo },
        phase: 'recall',
      },
      mastered: [],
    };
  }

  if (step.kind === 'build' && step.unlocked < mineCount(plan, step.chunk)) {
    return { state: { step: { ...step, unlocked: step.unlocked + 1 }, phase: 'present' }, mastered: [] };
  }
  if (step.kind === 'build' && step.joinTarget > 0) {
    return { state: { step: { kind: 'join', upTo: step.joinTarget }, phase: 'recall' }, mastered: [] };
  }
  const upTo = step.kind === 'join' ? step.upTo : step.chunk;
  const mastered = mineIds(plan, plan.chunks.slice(0, upTo + 1));
  const next = upTo + 1;
  return {
    state: next < plan.chunks.length ? startChunk(next) : { step: { kind: 'done' }, phase: 'recall' },
    mastered,
  };
}

/** A scheduled review recites the due line's chunk from its start down to that line. */
export function reviewLines(plan: RecitationPlan, itemId: string): number[] {
  const index = plan.lines.findIndex((line) => line.itemId === itemId);
  const chunk = plan.chunks.find((indices) => indices.includes(index));
  return chunk ? chunk.slice(0, chunk.indexOf(index) + 1) : [];
}

/**
 * Session order for Simple mode: each lines-mode sequence's line cards are gathered at
 * the position of its first card, in poem order, so the progress bar follows the
 * recitation. Other cards keep their places.
 */
export function inRecitationOrder(cards: Card[], sequenceByCard: ReadonlyMap<string, Sequence>): Card[] {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const sequence = sequenceByCard.get(card.id);
    if (!sequence || !card.sequenceItemId) continue;
    groups.set(sequence.id, [...(groups.get(sequence.id) ?? []), card]);
  }
  const position = (card: Card) =>
    sequenceByCard.get(card.id)!.items.findIndex((item) => item.id === card.sequenceItemId);
  const placed = new Set<string>();
  return cards.flatMap((card) => {
    const sequence = sequenceByCard.get(card.id);
    if (!sequence || !card.sequenceItemId) return [card];
    if (placed.has(sequence.id)) return [];
    placed.add(sequence.id);
    return [...groups.get(sequence.id)!].sort((a, b) => position(a) - position(b));
  });
}
