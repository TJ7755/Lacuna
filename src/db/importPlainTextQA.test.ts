import { expect, it } from 'vitest';
import { parsePlainTextQA, parseImportAuto } from './importEngine';

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

it('counts a prefixed question without an answer once', () => {
  expect(parsePlainTextQA('Q: Unanswered')).toEqual({ cards: [], skipped: 1 });
});

it('imports the blank-line separated plain-text blocks advertised by the import panel', () => {
  expect(parseImportAuto('First question\nFirst answer\nMore detail\n\nSecond question\nSecond answer')).toEqual({
    cards: [
      { type: 'front_back', front: 'First question', back: 'First answer\nMore detail' },
      { type: 'front_back', front: 'Second question', back: 'Second answer' },
    ],
    skipped: 0,
  });
});
