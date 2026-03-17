import { describe, expect, it } from 'vitest';
import { parsePastedCards } from './deckImport';

describe('parsePastedCards', () => {
  it('parses tab-delimited rows', () => {
    const input = 'Term A\tDefinition A\nTerm B\tDefinition B';
    const result = parsePastedCards(input, '\t');

    expect(result.cards).toEqual([
      { front: 'Term A', back: 'Definition A' },
      { front: 'Term B', back: 'Definition B' },
    ]);
    expect(result.skipped).toBe(0);
  });

  it('parses semicolon-delimited rows', () => {
    const input = 'A;B\nC;D';
    const result = parsePastedCards(input, ';');

    expect(result.cards).toEqual([
      { front: 'A', back: 'B' },
      { front: 'C', back: 'D' },
    ]);
  });

  it('parses comma-delimited rows', () => {
    const input = 'A,B\nC,D';
    const result = parsePastedCards(input, ',');

    expect(result.cards).toEqual([
      { front: 'A', back: 'B' },
      { front: 'C', back: 'D' },
    ]);
  });

  it('ignores blank lines and trims whitespace', () => {
    const input = '  Alpha\t Beta  \n\n  Gamma\tDelta  ';
    const result = parsePastedCards(input, '\t');

    expect(result.cards).toEqual([
      { front: 'Alpha', back: 'Beta' },
      { front: 'Gamma', back: 'Delta' },
    ]);
    expect(result.skipped).toBe(0);
  });

  it('skips lines without delimiters or missing values', () => {
    const input = 'No delimiter\nFront only\t\n\tBack only\nGood\tRow';
    const result = parsePastedCards(input, '\t');

    expect(result.cards).toEqual([{ front: 'Good', back: 'Row' }]);
    expect(result.skipped).toBe(3);
  });
});
