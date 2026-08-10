import { describe, expect, it } from 'vitest';
import { labelToOutput, PALETTE_KEYS, SYMBOLS, TARGET_EXPRESSIONS } from './symbols';

describe('palette', () => {
  it('covers every character in every target', () => {
    // The first session shipped without `x` and `y`, so three targets could not be
    // entered at all and their trials had to be discarded. An arm that cannot express
    // its own targets measures the harness, not the input method.
    const keys = new Set(PALETTE_KEYS);
    const missing = [
      ...new Set(TARGET_EXPRESSIONS.flatMap((target) => [...target])),
    ].filter((character) => !keys.has(character));
    expect(missing).toEqual([]);
  });

  it('has no duplicate keys', () => {
    expect(new Set(PALETTE_KEYS).size).toBe(PALETTE_KEYS.length);
  });
});

describe('symbols', () => {
  it('covers every character a target needs, except the layout-only `^`', () => {
    // `^` is produced by superscript placement (stage 4), not by writing a caret, so it
    // is deliberately absent from the drawable symbol set.
    const outputs = new Set(SYMBOLS.map((symbol) => symbol.output));
    const missing = [
      ...new Set(TARGET_EXPRESSIONS.flatMap((target) => [...target])),
    ].filter((character) => character !== '^' && !outputs.has(character));
    expect(missing).toEqual([]);
  });

  it('has unique labels and unique outputs', () => {
    expect(new Set(SYMBOLS.map((s) => s.label)).size).toBe(SYMBOLS.length);
    expect(new Set(SYMBOLS.map((s) => s.output)).size).toBe(SYMBOLS.length);
  });

  it('maps labels to their output characters', () => {
    expect(labelToOutput('plus')).toBe('+');
    expect(labelToOutput('7')).toBe('7');
  });

  it('maps an unknown label to nothing rather than throwing', () => {
    // Layout must survive a recogniser holding templates this table does not know.
    expect(labelToOutput('sqrt')).toBe('');
  });
});
