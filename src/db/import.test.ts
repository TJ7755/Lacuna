import { describe, expect, it } from 'vitest';
import { parseImport } from './import';

describe('parseImport', () => {
  it('parses tab/newline by default', () => {
    const { cards, skipped } = parseImport('Front 1\tBack 1\nFront 2\tBack 2');
    expect(skipped).toBe(0);
    expect(cards).toEqual([
      { type: 'front_back', front: 'Front 1', back: 'Back 1' },
      { type: 'front_back', front: 'Front 2', back: 'Back 2' },
    ]);
  });

  it('supports a custom field separator (CSV)', () => {
    const { cards } = parseImport('Q,A', ',');
    expect(cards).toEqual([{ type: 'front_back', front: 'Q', back: 'A' }]);
  });

  it('reads a third column as space-separated tags', () => {
    const { cards } = parseImport('Q\tA\tchem acids', '\t');
    expect(cards[0]).toEqual({
      type: 'front_back',
      front: 'Q',
      back: 'A',
      tags: ['chem', 'acids'],
    });
  });

  it('honours quoted fields containing the separator', () => {
    const { cards } = parseImport('"a, b",answer', ',');
    expect(cards[0]).toEqual({ type: 'front_back', front: 'a, b', back: 'answer' });
  });

  it('handles escaped quotes and quoted line breaks', () => {
    const { cards } = parseImport('"line1\nline2","say ""hi"""', ',');
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe('line1\nline2');
    expect(cards[0].back).toBe('say "hi"');
  });

  it('treats a lone cloze column as a cloze card', () => {
    const { cards } = parseImport('Water is {{c1::H2O}}.');
    expect(cards[0]).toEqual({
      type: 'cloze',
      front: 'Water is {{c1::H2O}}.',
      back: '',
    });
  });

  it('skips single columns with no answer and no cloze', () => {
    const { cards, skipped } = parseImport('Just a prompt');
    expect(cards).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('normalises CRLF and ignores blank rows', () => {
    const { cards } = parseImport('A\tB\r\n\r\nC\tD\r\n');
    expect(cards).toHaveLength(2);
  });

  it('supports a blank-line row separator for multi-line cards', () => {
    const { cards } = parseImport('Q1\tline one\nline two\n\nQ2\tB2', '\t', '\n\n');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      type: 'front_back',
      front: 'Q1',
      back: 'line one\nline two',
    });
  });

  it('returns nothing for empty input', () => {
    expect(parseImport('   ')).toEqual({ cards: [], skipped: 0 });
  });
});
