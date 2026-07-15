import { describe, expect, it } from 'vitest';
import type { PracticeNode } from '../../db/types';
import {
  emptyPracticeNodeDraft,
  draftFromPracticeNode,
  parseCardCount,
} from './practiceNodeDraft';

describe('parseCardCount', () => {
  it('returns undefined for a blank or whitespace-only string', () => {
    expect(parseCardCount('')).toBeUndefined();
    expect(parseCardCount('   ')).toBeUndefined();
  });

  it('returns undefined for zero and negative values', () => {
    expect(parseCardCount('0')).toBeUndefined();
    expect(parseCardCount('-5')).toBeUndefined();
  });

  it('returns undefined for non-numeric input', () => {
    expect(parseCardCount('abc')).toBeUndefined();
    expect(parseCardCount('Infinity')).toBeUndefined();
  });

  it('parses valid positive integers', () => {
    expect(parseCardCount('1')).toBe(1);
    expect(parseCardCount('25')).toBe(25);
  });

  it('floors fractional input', () => {
    expect(parseCardCount('7.9')).toBe(7);
  });
});

describe('emptyPracticeNodeDraft', () => {
  it('seeds a blank draft with the given default position', () => {
    expect(emptyPracticeNodeDraft(3)).toEqual({
      name: '',
      position: 3,
      lessonIds: undefined,
      cardCount: '',
      randomize: false,
    });
  });

  it('leaves position undefined (start of course) when no default is given', () => {
    expect(emptyPracticeNodeDraft().position).toBeUndefined();
  });
});

describe('draftFromPracticeNode', () => {
  const base: PracticeNode = {
    id: 'pn1',
    courseId: 'c1',
    type: 'manual',
    name: 'Weekly review',
    createdAt: 0,
  };

  it('maps a fully-populated node into a draft', () => {
    expect(
      draftFromPracticeNode({
        ...base,
        position: 2,
        lessonIds: ['l1', 'l2'],
        cardCount: 20,
        randomize: true,
      }),
    ).toEqual({
      name: 'Weekly review',
      position: 2,
      lessonIds: ['l1', 'l2'],
      cardCount: '20',
      randomize: true,
    });
  });

  it('maps absent optional fields to draft defaults', () => {
    expect(draftFromPracticeNode(base)).toEqual({
      name: 'Weekly review',
      position: undefined,
      lessonIds: undefined,
      cardCount: '',
      randomize: false,
    });
  });
});
