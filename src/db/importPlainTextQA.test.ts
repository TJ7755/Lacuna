import { expect, it } from 'vitest';
import { parsePlainTextQA } from './importEngine';

it.each(['A: First reason', 'First reason'])(
  'preserves continuation lines in prefixed plain-text answers starting with %s',
  (answer) => {
    const result = parsePlainTextQA(`Q: Why?\n${answer}\nSecond reason\nQ: Where?\nA: Here`);
    expect(result).toEqual({
      cards: [
        { type: 'front_back', front: 'Why?', back: 'First reason\nSecond reason' },
        { type: 'front_back', front: 'Where?', back: 'Here' },
      ],
      skipped: 0,
    });
  },
);
