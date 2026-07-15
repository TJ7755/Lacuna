import { describe, it, expect } from 'vitest';
import { examEveAvailable, EXAM_EVE_WINDOW_HOURS } from './cram';
import { defaultFsrsParameters, FSRS_VERSION, MS_PER_DAY } from './params';
import type { Deck, ExamObjective } from '../db/types';

const HOUR = 60 * 60 * 1000;

function makeDeck(objective: ExamObjective, examDate: number, overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'd1',
    name: 'Deck',
    examDate,
    createdAt: 0,
    fsrsVersion: FSRS_VERSION,
    fsrsParameters: defaultFsrsParameters(),
    examObjective: objective,
    ...overrides,
  };
}

describe('examEveAvailable', () => {
  const now = 10 * MS_PER_DAY;
  it('is true within the window and ahead of the exam', () => {
    expect(examEveAvailable(makeDeck('expectedMarks', now + 24 * HOUR), now)).toBe(true);
  });
  it('is false outside the window', () => {
    expect(
      examEveAvailable(makeDeck('expectedMarks', now + (EXAM_EVE_WINDOW_HOURS + 1) * HOUR), now),
    ).toBe(false);
  });
  it('is false once the exam has passed', () => {
    expect(examEveAvailable(makeDeck('expectedMarks', now - HOUR), now)).toBe(false);
  });
  it('is false for an archived deck', () => {
    expect(
      examEveAvailable(makeDeck('expectedMarks', now + HOUR, { archived: true }), now),
    ).toBe(false);
  });
});
