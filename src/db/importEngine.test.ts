import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  parseMarkdownTable,
  parseMarkdownList,
  parseJsonImport,
  parseAnkiText,
  parsePlainTextQA,
  parseImportAuto,
} from './importEngine';

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

describe('detectFormat', () => {
  it('returns unknown for empty input', () => {
    expect(detectFormat('')).toEqual({ format: 'unknown', confidence: 0 });
    expect(detectFormat('   ')).toEqual({ format: 'unknown', confidence: 0 });
  });

  it('detects share codes', () => {
    expect(detectFormat('LAC1aGVsbG8=')).toEqual({ format: 'share-code', confidence: 1 });
    expect(detectFormat('LAC0d29ybGQ=')).toEqual({ format: 'share-code', confidence: 1 });
  });

  it('detects JSON arrays of card objects', () => {
    const input = JSON.stringify([
      { front: 'What is 2+2?', back: '4' },
      { front: 'Capital of France?', back: 'Paris' },
    ]);
    const result = detectFormat(input);
    expect(result.format).toBe('json');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('detects JSON with question/answer keys', () => {
    const input = JSON.stringify([{ question: 'Q1', answer: 'A1' }]);
    expect(detectFormat(input).format).toBe('json');
  });

  it('detects Markdown tables with separator row', () => {
    const input = `| Front | Back |
| --- | --- |
| Q1 | A1 |
| Q2 | A2 |`;
    const result = detectFormat(input);
    expect(result.format).toBe('markdown-table');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('detects Markdown lists', () => {
    const input = `- item 1
- item 2
- item 3`;
    expect(detectFormat(input).format).toBe('markdown-list');
  });

  it('detects TSV', () => {
    const input = 'Q1\tA1\nQ2\tA2';
    expect(detectFormat(input).format).toBe('tsv');
  });

  it('detects CSV', () => {
    const input = 'Q1,A1\nQ2,A2';
    expect(detectFormat(input).format).toBe('csv');
  });

  it('detects Q:/A: plain text', () => {
    const input = 'Q: What is 2+2?\nA: 4\nQ: Capital of France?\nA: Paris';
    expect(detectFormat(input).format).toBe('plain-text');
  });
});

// ---------------------------------------------------------------------------
// Markdown table parser
// ---------------------------------------------------------------------------

describe('parseMarkdownTable', () => {
  it('parses a standard GFM table', () => {
    const input = `| Front | Back |
| --- | --- |
| Water | H2O |
| Oxygen | O2 |`;
    const result = parseMarkdownTable(input);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toEqual({ type: 'front_back', front: 'Water', back: 'H2O' });
    expect(result.cards[1]).toEqual({ type: 'front_back', front: 'Oxygen', back: 'O2' });
    expect(result.skipped).toBe(0);
  });

  it('uses header names to map columns', () => {
    const input = `| Question | Answer | Tags |
| --- | --- | --- |
| What is 2+2? | 4 | maths |
| Capital of France? | Paris | geography |`;
    const result = parseMarkdownTable(input);
    expect(result.cards[0]).toEqual({
      type: 'front_back',
      front: 'What is 2+2?',
      back: '4',
      tags: ['maths'],
    });
  });

  it('handles cloze cards', () => {
    const input = `| Front | Back |
| --- | --- |
| Water is {{c1::H2O}} | |`;
    const result = parseMarkdownTable(input);
    expect(result.cards[0].type).toBe('cloze');
  });

  it('skips empty rows', () => {
    const input = `| Front | Back |
| --- | --- |
| Q1 | A1 |
| | |
| Q2 | A2 |`;
    const result = parseMarkdownTable(input);
    expect(result.cards).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Markdown list parser
// ---------------------------------------------------------------------------

describe('parseMarkdownList', () => {
  it('parses Q:/A: list items', () => {
    const input = `- Q: What is 2+2?
- A: 4
- Q: Capital of France?
- A: Paris`;
    const result = parseMarkdownList(input);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toEqual({
      type: 'front_back',
      front: 'What is 2+2?',
      back: '4',
    });
  });

  it('parses **Q:** and **A:** prefixed items', () => {
    const input = `- **Q:** What is 2+2?
- **A:** 4`;
    const result = parseMarkdownList(input);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].front).toBe('What is 2+2?');
    expect(result.cards[0].back).toBe('4');
  });

  it('parses blank-line separated blocks', () => {
    const input = `What is 2+2?
4

Capital of France?
Paris`;
    const result = parseMarkdownList(input);
    expect(result.cards).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// JSON parser
// ---------------------------------------------------------------------------

describe('parseJsonImport', () => {
  it('parses a JSON array of objects', () => {
    const input = JSON.stringify([
      { front: 'Q1', back: 'A1' },
      { front: 'Q2', back: 'A2' },
    ]);
    const result = parseJsonImport(input);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toEqual({ type: 'front_back', front: 'Q1', back: 'A1' });
  });

  it('parses JSON with question/answer keys', () => {
    const input = JSON.stringify([{ question: 'What?', answer: 'This.' }]);
    const result = parseJsonImport(input);
    expect(result.cards[0].front).toBe('What?');
    expect(result.cards[0].back).toBe('This.');
  });

  it('parses JSON with tags', () => {
    const input = JSON.stringify([{ front: 'Q', back: 'A', tags: ['tag1', 'tag2'] }]);
    const result = parseJsonImport(input);
    expect(result.cards[0].tags).toEqual(['tag1', 'tag2']);
  });

  it('parses JSON wrapped in an object', () => {
    const input = JSON.stringify({ cards: [{ front: 'Q', back: 'A' }] });
    const result = parseJsonImport(input);
    expect(result.cards).toHaveLength(1);
  });

  it('skips items without a front', () => {
    const input = JSON.stringify([{ back: 'only back' }, { front: 'has front', back: 'A' }]);
    const result = parseJsonImport(input);
    expect(result.cards).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it('handles invalid JSON gracefully', () => {
    expect(parseJsonImport('not json').cards).toHaveLength(0);
  });

  it('falls back to first two string values for arbitrary key-value JSON', () => {
    const input = JSON.stringify([
      { de: 'Deutschland', en: 'Germany' },
      { de: 'Österreich', en: 'Austria' },
      { de: 'Frankreich', en: 'France' },
    ]);
    const result = parseJsonImport(input);
    expect(result.cards).toHaveLength(3);
    expect(result.cards[0]).toEqual({ type: 'front_back', front: 'Deutschland', back: 'Germany' });
    expect(result.cards[1]).toEqual({ type: 'front_back', front: 'Österreich', back: 'Austria' });
    expect(result.cards[2]).toEqual({ type: 'front_back', front: 'Frankreich', back: 'France' });
  });

  it('skips objects with only one string value and no recognised keys', () => {
    const input = JSON.stringify([{ label: 'Water' }, { label: 'Oxygen' }]);
    const result = parseJsonImport(input);
    expect(result.cards).toHaveLength(0);
    expect(result.skipped).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Anki text parser
// ---------------------------------------------------------------------------

describe('parseAnkiText', () => {
  it('parses tab-separated Anki export', () => {
    const input = 'Front1\tBack1\nFront2\tBack2';
    const result = parseAnkiText(input);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toEqual({ type: 'front_back', front: 'Front1', back: 'Back1' });
  });

  it('parses Anki export with tags', () => {
    const input = 'Front1\tBack1\ttag1 tag2';
    const result = parseAnkiText(input);
    expect(result.cards[0].tags).toEqual(['tag1', 'tag2']);
  });

  it('skips comment lines', () => {
    const input = '# comment\nFront1\tBack1\n# another comment';
    const result = parseAnkiText(input);
    expect(result.cards).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Plain text Q&A parser
// ---------------------------------------------------------------------------

describe('parsePlainTextQA', () => {
  it('parses Q:/A: style', () => {
    const input = 'Q: What is 2+2?\nA: 4\nQ: Capital of France?\nA: Paris';
    const result = parsePlainTextQA(input);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toEqual({
      type: 'front_back',
      front: 'What is 2+2?',
      back: '4',
    });
  });

  it('parses Question:/Answer: style', () => {
    const input = 'Question: What?\nAnswer: This.';
    const result = parsePlainTextQA(input);
    expect(result.cards).toHaveLength(1);
  });

  it('parses em-dash separated pairs', () => {
    const input = 'Q1 — A1\nQ2 — A2';
    const result = parsePlainTextQA(input);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].front).toBe('Q1');
    expect(result.cards[0].back).toBe('A1');
  });

  it('parses pipe-separated pairs', () => {
    const input = 'Q1 | A1\nQ2 | A2';
    const result = parsePlainTextQA(input);
    expect(result.cards).toHaveLength(2);
  });

  it('parses tab-separated pairs', () => {
    const input = 'Q1\tA1\nQ2\tA2';
    const result = parsePlainTextQA(input);
    expect(result.cards).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Unified parser
// ---------------------------------------------------------------------------

describe('parseImportAuto', () => {
  it('auto-detects and parses Markdown tables', () => {
    const input = `| Front | Back |
| --- | --- |
| Q1 | A1 |`;
    const result = parseImportAuto(input);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].front).toBe('Q1');
  });

  it('auto-detects and parses JSON', () => {
    const input = JSON.stringify([{ front: 'Q1', back: 'A1' }]);
    const result = parseImportAuto(input);
    expect(result.cards).toHaveLength(1);
  });

  it('returns empty for share codes (caller handles)', () => {
    const result = parseImportAuto('LAC1abc123');
    expect(result.cards).toHaveLength(0);
  });

  it('respects format override', () => {
    const input = 'Q1\tA1\nQ2\tA2';
    const result = parseImportAuto(input, { format: 'tsv' });
    expect(result.cards).toHaveLength(2);
  });

  it('falls back to legacy parser for CSV', () => {
    const input = 'Q1,A1\nQ2,A2';
    const result = parseImportAuto(input);
    expect(result.cards).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(parseImportAuto('').cards).toHaveLength(0);
  });
});
