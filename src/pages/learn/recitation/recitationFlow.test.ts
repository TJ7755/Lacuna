import { describe, expect, it } from 'vitest';
import type { Card, Sequence, SequenceItem } from '../../../db/types';
import {
  advanceRecitation,
  initialRecitationState,
  inRecitationOrder,
  presentedLines,
  recitationPlan,
  targetLines,
  type RecitationPlan,
  type RecitationState,
} from './recitationFlow';

function sequence(items: Partial<SequenceItem>[], extra: Partial<Sequence> = {}): Sequence {
  return {
    id: 's',
    courseId: 'c',
    primaryLessonId: null,
    name: 'Poem',
    mode: 'lines',
    cueWindow: 2,
    createdAt: 0,
    items: items.map((item, i) => ({ id: `i${i}`, value: `line ${i}`, ...item })),
    ...extra,
  } as Sequence;
}

const lines = (n: number) => Array.from({ length: n }, () => ({}));
const ids = (plan: RecitationPlan, indices: number[]) => indices.map((i) => plan.lines[i].itemId);
const pass = new Set<string>();

/** Present, then recite with the given wrong ids. */
function check(plan: RecitationPlan, state: RecitationState, wrong: string[] = []) {
  const recalled = state.phase === 'present' ? advanceRecitation(plan, state, pass).state : state;
  return advanceRecitation(plan, recalled, new Set(wrong));
}

describe('recitationPlan', () => {
  it('chunks by four lines by default', () => {
    expect(recitationPlan(sequence(lines(10))).chunks).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9],
    ]);
  });

  it('honours an explicit chunk size over stanzas', () => {
    const items = [0, 0, 0, 1, 1, 1].map((chunkIndex) => ({ chunkIndex }));
    expect(recitationPlan(sequence(items)).chunks).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(recitationPlan(sequence(items, { recitationChunkSize: 2 })).chunks).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it('counts only mine lines towards a chunk and keeps cues with the next line', () => {
    const items = [
      { speaker: 'B' },
      { speaker: 'A' },
      { speaker: 'B' },
      { speaker: 'A' },
      { speaker: 'B' },
    ];
    const plan = recitationPlan(sequence(items, { mySpeaker: 'A', recitationChunkSize: 2 }));
    expect(plan.chunks).toEqual([[0, 1, 2, 3, 4]]);
    expect(plan.lines.map((line) => line.mine)).toEqual([false, true, false, true, false]);
  });
});

describe('cumulative recitation', () => {
  const plan = recitationPlan(sequence(lines(6), { recitationChunkSize: 3 }));

  it('presents one new line, then recites the whole unlocked prefix', () => {
    let state = initialRecitationState(plan);
    expect(state.phase).toBe('present');
    expect(ids(plan, presentedLines(plan, state.step))).toEqual(['i0']);
    state = check(plan, state).state;
    expect(state.phase).toBe('present');
    expect(ids(plan, presentedLines(plan, state.step))).toEqual(['i1']);
    expect(ids(plan, targetLines(plan, state.step))).toEqual(['i0', 'i1']);
  });

  it('retries the same prefix after a mistake without unlocking more', () => {
    let state = check(plan, initialRecitationState(plan)).state;
    const failed = check(plan, state, ['i0']);
    expect(failed.state).toEqual({ step: state.step, phase: 'recall' });
    expect(failed.mastered).toEqual([]);
    state = advanceRecitation(plan, failed.state, pass).state;
    expect(ids(plan, targetLines(plan, state.step))).toEqual(['i0', 'i1', 'i2']);
  });

  it('masters the first chunk alone, then joins later chunks from the top', () => {
    let state = initialRecitationState(plan);
    for (let i = 0; i < 2; i += 1) state = check(plan, state).state;
    const first = check(plan, state);
    expect(first.mastered).toEqual(['i0', 'i1', 'i2']);
    state = first.state;
    for (let i = 0; i < 3; i += 1) state = check(plan, state).state;
    expect(state).toEqual({ step: { kind: 'join', upTo: 1 }, phase: 'recall' });
    expect(ids(plan, targetLines(plan, state.step))).toEqual(['i0', 'i1', 'i2', 'i3', 'i4', 'i5']);
    const done = check(plan, state);
    expect(done.mastered).toEqual(['i0', 'i1', 'i2', 'i3', 'i4', 'i5']);
    expect(done.state.step).toEqual({ kind: 'done' });
  });

  it('sends a failed join back to the chunk holding the first error', () => {
    const state: RecitationState = { step: { kind: 'join', upTo: 1 }, phase: 'recall' };
    const back = check(plan, state, ['i1', 'i4']).state;
    expect(back).toEqual({
      step: { kind: 'build', chunk: 0, unlocked: 3, joinTarget: 1 },
      phase: 'recall',
    });
    expect(check(plan, back).state).toEqual(state);
  });

  it('resumes at the first chunk with an unmastered line', () => {
    const state = initialRecitationState(plan, new Set(['i0', 'i1', 'i2']));
    expect(state.step).toEqual({ kind: 'build', chunk: 1, unlocked: 1, joinTarget: 1 });
    expect(initialRecitationState(plan, new Set(plan.lines.map((l) => l.itemId))).step).toEqual({
      kind: 'done',
    });
  });

  it('presents the cue lines leading into a new line of dialogue', () => {
    const script = recitationPlan(
      sequence([{ speaker: 'A' }, { speaker: 'B' }, { speaker: 'B' }, { speaker: 'A' }], {
        mySpeaker: 'A',
      }),
    );
    const state = check(script, initialRecitationState(script)).state;
    expect(ids(script, presentedLines(script, state.step))).toEqual(['i1', 'i2', 'i3']);
  });
});

describe('inRecitationOrder', () => {
  it('gathers a sequence\'s line cards in poem order at its first card', () => {
    const poem = sequence([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const card = (id: string, sequenceItemId?: string) => ({ id, sequenceItemId }) as Card;
    const cards = [card('x'), card('c3', 'c'), card('y'), card('a1', 'a'), card('b2', 'b')];
    const map = new Map([['a1', poem], ['b2', poem], ['c3', poem]]);
    expect(inRecitationOrder(cards, map).map((c) => c.id)).toEqual(['x', 'a1', 'b2', 'c3', 'y']);
  });
});
