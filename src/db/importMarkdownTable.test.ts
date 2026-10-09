import { expect, it } from 'vitest';
import { parseMarkdownTable } from './importEngine';

it('preserves an escaped final pipe when a Markdown row omits its closing delimiter', () => {
  expect(parseMarkdownTable('| Front | Back |\n| --- | --- |\n| Symbol | A \\|')).toEqual({
    cards: [{ type: 'front_back', front: 'Symbol', back: 'A |' }],
    skipped: 0,
  });
});
