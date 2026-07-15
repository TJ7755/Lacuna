import { describe, expect, it } from 'vitest';
import { splitScript } from './scriptSplitter';

function idGen() {
  let n = 0;
  return () => `id-${n++}`;
}

describe('splitScript', () => {
  it('splits consecutive "NAME: line" pairs into items', () => {
    const raw = `ALICE: Hello there.\nBOB: General Kenobi.`;
    const result = splitScript(raw, idGen());
    expect(result.items).toEqual([
      { id: 'id-0', speaker: 'ALICE', value: 'Hello there.' },
      { id: 'id-1', speaker: 'BOB', value: 'General Kenobi.' },
    ]);
    expect(result.speakers).toEqual(['ALICE', 'BOB']);
    expect(result.unmatchedLines).toEqual([]);
  });

  it('folds a wrapped continuation line into the preceding item', () => {
    const raw = `ALICE: This is a long line\nthat wraps onto a second one.\nBOB: Short reply.`;
    const result = splitScript(raw, idGen());
    expect(result.items[0].value).toBe('This is a long line\nthat wraps onto a second one.');
    expect(result.items).toHaveLength(2);
  });

  it('ignores blank lines between speeches without breaking continuation', () => {
    const raw = `ALICE: First part\n\nstill Alice's line.\n\nBOB: Reply.`;
    const result = splitScript(raw, idGen());
    expect(result.items[0].value).toBe("First part\nstill Alice's line.");
    expect(result.items[1]).toEqual({ id: 'id-1', speaker: 'BOB', value: 'Reply.' });
  });

  it('tracks distinct speakers in order of first appearance, once each', () => {
    const raw = `ALICE: Hi\nBOB: Hi\nALICE: Bye\nBOB: Bye`;
    const result = splitScript(raw, idGen());
    expect(result.speakers).toEqual(['ALICE', 'BOB']);
  });

  it('collects leading lines with no recognised speaker as unmatched', () => {
    const raw = `INT. KITCHEN - DAY\n\nALICE: Hello.`;
    const result = splitScript(raw, idGen());
    expect(result.unmatchedLines).toEqual(['INT. KITCHEN - DAY']);
    expect(result.items).toHaveLength(1);
  });

  it('accepts multi-word and punctuated speaker names', () => {
    const raw = `MRS ROBINSON: Well.\nO'BRIEN: Indeed.\n2ND GUARD: Halt!`;
    const result = splitScript(raw, idGen());
    expect(result.speakers).toEqual(['MRS ROBINSON', "O'BRIEN", '2ND GUARD']);
  });

  it('returns empty results for blank input', () => {
    const result = splitScript('   \n\n  ', idGen());
    expect(result).toEqual({ items: [], speakers: [], unmatchedLines: [] });
  });

  it('does not treat a mid-line colon without a leading speaker-like token as a split (URL-ish text stays unmatched or folds in)', () => {
    const raw = `ALICE: Check this out: it's great.`;
    const result = splitScript(raw, idGen());
    // Greedy match picks the first colon as the separator by design (matches the common case).
    expect(result.items[0]).toEqual({ id: 'id-0', speaker: 'ALICE', value: "Check this out: it's great." });
  });
});
