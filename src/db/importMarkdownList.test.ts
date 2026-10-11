import { expect, it } from 'vitest';
import { parseImportAuto, parseMarkdownList } from './importEngine';

it('preserves indented continuation lines in ordered Markdown pairs', () => {
  expect(parseImportAuto('1. Explain\n   the process\n2. First step\n   Second step\n3. Where?\n4. Here')).toEqual({
    cards: [
      { type: 'front_back', front: 'Explain\nthe process', back: 'First step\nSecond step' },
      { type: 'front_back', front: 'Where?', back: 'Here' },
    ],
    skipped: 0,
  });
});

it('retains continuation lines in prefixed Markdown list answers', () => {
  expect(parseMarkdownList('- Q: Why?\n- A: First reason\n  Second reason')).toEqual({
    cards: [{ type: 'front_back', front: 'Why?', back: 'First reason\nSecond reason' }],
    skipped: 0,
  });
});

it('keeps nested ordered answer lists inside their parent card', () => {
  expect(parseMarkdownList('1. Explain\n2. Points\n   1. First\n   2. Second')).toEqual({
    cards: [{ type: 'front_back', front: 'Explain', back: 'Points\n1. First\n2. Second' }],
    skipped: 0,
  });
});

it.each(['1.', '1)', '-'])('strips Q/A labels from %s Markdown list items', (marker) => {
  const nextMarker = marker.startsWith('1') ? marker.replace('1', '2') : marker;
  const input = `${marker} **Question:** Why?\n${nextMarker} **Answer:** First reason\n${' '.repeat(nextMarker.length + 1)}Second reason`;
  expect(parseImportAuto(input)).toEqual({
    cards: [{ type: 'front_back', front: 'Why?', back: 'First reason\nSecond reason' }],
    skipped: 0,
  });
});
