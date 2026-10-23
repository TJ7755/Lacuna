import { describe, expect, it, vi } from 'vitest';
import type { Card, Sequence, SequenceItem } from '../../../db/types';
import {
  advanceRecitation,
  initialRecitationState,
  inRecitationOrder,
  shuffledSimpleQueue,
  isRecitationStateFor,
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

  it('keeps leading speaker cues with the first learner line of the next chunk', () => {
    const script = recitationPlan(
      sequence(
        [
          { speaker: 'B' },
          { speaker: 'A' },
          { speaker: 'B' },
          { speaker: 'A' },
          { speaker: 'B' },
          { speaker: 'A' },
          { speaker: 'B' },
        ],
        { mySpeaker: 'A', recitationChunkSize: 2 },
      ),
    );

    expect(script.chunks).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6],
    ]);
    const first = initialRecitationState(script);
    const secondLine = check(script, first).state;
    const nextChunk = check(script, secondLine).state;
    expect(ids(script, presentedLines(script, nextChunk.step))).toEqual(['i4', 'i5']);
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

  it('presents the new dialogue line even when another speaker follows it', () => {
    const script = recitationPlan(
      sequence(
        [{ speaker: 'B' }, { speaker: 'A' }, { speaker: 'B' }, { speaker: 'A' }, { speaker: 'B' }],
        { mySpeaker: 'A' },
      ),
    );
    const initial = initialRecitationState(script);
    expect(ids(script, presentedLines(script, initial.step))).toEqual(['i0', 'i1']);
    const next = check(script, initial).state;
    expect(ids(script, presentedLines(script, next.step))).toEqual(['i2', 'i3']);
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

describe('recitation across speakers and chunks', () => {
  // Alice and Charlie cue; Bob, the learner, replies. Two of Bob's lines per chunk.
  const script = recitationPlan(
    sequence(
      ['Alice', 'Bob', 'Charlie', 'Bob', 'Alice', 'Bob', 'Charlie', 'Bob'].map((speaker) => ({
        speaker,
      })),
      { mySpeaker: 'Bob', recitationChunkSize: 2 },
    ),
  );

  it('starts each chunk with the cue leading into its first line', () => {
    expect(script.chunks).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ]);
  });

  it('presents the newly unlocked line with its own cue, never a later one', () => {
    const first = initialRecitationState(script);
    expect(ids(script, presentedLines(script, first.step))).toEqual(['i0', 'i1']);
    expect(ids(script, targetLines(script, first.step))).toEqual(['i0', 'i1']);
    const second = check(script, first).state;
    expect(ids(script, presentedLines(script, second.step))).toEqual(['i2', 'i3']);
    const nextChunk = check(script, second).state;
    expect(nextChunk.step).toEqual({ kind: 'build', chunk: 1, unlocked: 1, joinTarget: 1 });
    expect(ids(script, presentedLines(script, nextChunk.step))).toEqual(['i4', 'i5']);
  });
});

describe('inRecitationOrder', () => {
  it('orders a large sequence without repeatedly scanning its full item list', () => {
    const size = 1_000;
    let itemIdReads = 0;
    const poem = sequence(Array.from({ length: size }, (_, index) => ({ id: `item-${index}` })));
    for (const item of poem.items) {
      const id = item.id;
      Object.defineProperty(item, 'id', {
        get: () => {
          itemIdReads += 1;
          return id;
        },
      });
    }
    const cards = Array.from(
      { length: size },
      (_, index) =>
        ({
          id: `card-${size - index - 1}`,
          sequenceItemId: `item-${size - index - 1}`,
        }) as Card,
    );
    const byCard = new Map(cards.map((card) => [card.id, poem]));
    const originalIds = cards.map((card) => card.id);

    const ordered = inRecitationOrder(cards, byCard);

    expect(ordered.map((card) => card.id)).toEqual(
      Array.from({ length: size }, (_, index) => `card-${index}`),
    );
    expect(cards.map((card) => card.id)).toEqual(originalIds);
    expect(itemIdReads).toBeLessThanOrEqual(size * 20);
  });

  it("gathers a sequence's line cards in poem order at its first card", () => {
    const poem = sequence([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const card = (id: string, sequenceItemId?: string) => ({ id, sequenceItemId }) as Card;
    const cards = [card('x'), card('c3', 'c'), card('y'), card('a1', 'a'), card('b2', 'b')];
    const map = new Map([
      ['a1', poem],
      ['b2', poem],
      ['c3', poem],
    ]);
    expect(inRecitationOrder(cards, map).map((c) => c.id)).toEqual(['x', 'a1', 'b2', 'c3', 'y']);
  });
});

describe('isRecitationStateFor', () => {
  const plan = recitationPlan(sequence([{}, {}, {}], { recitationChunkSize: 2 }));
  it('accepts a step that fits the plan', () => {
    expect(isRecitationStateFor(plan, initialRecitationState(plan))).toBe(true);
    expect(isRecitationStateFor(plan, { step: { kind: 'join', upTo: 1 }, phase: 'recall' })).toBe(
      true,
    );
  });
  it('rejects a step an edited sequence no longer fits', () => {
    const build = (chunk: number, unlocked: number) => ({
      step: { kind: 'build', chunk, unlocked, joinTarget: chunk },
      phase: 'recall',
    });
    expect(isRecitationStateFor(plan, build(2, 1))).toBe(false);
    expect(isRecitationStateFor(plan, build(1, 2))).toBe(false);
    expect(isRecitationStateFor(plan, { step: { kind: 'join', upTo: 0 }, phase: 'recall' })).toBe(
      false,
    );
    expect(isRecitationStateFor(plan, { step: { kind: 'done' }, phase: 'recall' })).toBe(false);
    expect(isRecitationStateFor(plan, null)).toBe(false);
  });
});


describe('shuffledSimpleQueue', () => {
  const card = (id: string, sequenceItemId?: string) => ({ id, sequenceItemId }) as Card;

  it.each([0, 1])('handles %i cards without drawing randomness', (size) => {
    const cards = Array.from({ length: size }, (_, index) => card(String(index)));
    const random = vi.fn();
    expect(shuffledSimpleQueue(cards, new Map(), random)).toEqual(cards);
    expect(random).not.toHaveBeenCalled();
  });

  it('uses controlled draws to shuffle groups without changing their internal order or the input', () => {
    const first = sequence([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const second = sequence([{ id: 'd' }, { id: 'e' }], { id: 's2' });
    const cards = [card('x'), card('c', 'c'), card('e', 'e'), card('a', 'a'), card('y'), card('d', 'd')];
    const original = [...cards];
    const map = new Map([['c', first], ['a', first], ['e', second], ['d', second]]);
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.5).mockReturnValueOnce(0);
    const shuffled = shuffledSimpleQueue(cards, map, random);
    expect(shuffled.map((item) => item.id)).toEqual(['d', 'e', 'y', 'a', 'c', 'x']);
    expect(random).toHaveBeenCalledTimes(3);
    expect(shuffled).toHaveLength(cards.length);
    expect(new Set(shuffled)).toEqual(new Set(cards));
    expect(cards).toEqual(original);
    expect(first.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(shuffledSimpleQueue(cards, map, () => 0.999).map((item) => item.id))
      .toEqual(['x', 'a', 'c', 'd', 'e', 'y']);
  });
});
