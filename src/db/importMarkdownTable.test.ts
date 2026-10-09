import { expect, it } from 'vitest';
import { parseMarkdownTable, parseImportAuto, detectFormat } from './importEngine';

it('preserves an escaped final pipe when a Markdown row omits its closing delimiter', () => {
  expect(parseMarkdownTable('| Front | Back |\n| --- | --- |\n| Symbol | A \\|')).toEqual({
    cards: [{ type: 'front_back', front: 'Symbol', back: 'A |' }],
    skipped: 0,
  });
});

it.each([
  'Front | Back\n--- | ---\nQuestion | Answer',
  '| Front | Back |\n--- | ---\nQuestion | Answer',
])('imports Markdown tables with optional opening pipes: %s', (input) => {
  expect(detectFormat(input).format).toBe('markdown-table');
  expect(parseImportAuto(input)).toEqual({
    cards: [{ type: 'front_back', front: 'Question', back: 'Answer' }],
    skipped: 0,
  });
});

it('uses the delimiter row to locate a table amongst pipe-containing prose', () => {
  expect(parseImportAuto('Compare A | B first.\n\nFront | Back\n--- | ---\nWhy? | Because.\n\nOther | prose')).toEqual({
    cards: [{ type: 'front_back', front: 'Why?', back: 'Because.' }],
    skipped: 0,
  });
});
