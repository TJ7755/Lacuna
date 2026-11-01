import { describe, expect, it } from 'vitest';
import {
  formatQuestionMeta,
  highlightParameters,
  summariseQuestion,
  type QuestionBankSummary,
} from './bankSummary';
import type { QuestionAttempt, QuestionDefinition } from './types';

const question = {
  id: 'q1',
  kind: 'fixed',
  payload: {
    v: 1,
    kind: 'working',
    scheme: [
      { marks: 2, kind: 'predicate', predicate: 'equals', args: ['4'] },
      { marks: 1, kind: 'predicate', predicate: 'equals', args: ['8'] },
    ],
  },
} as unknown as QuestionDefinition;

function attempt(index: number, earned: number, seconds?: number): QuestionAttempt {
  return {
    id: `a${index}`,
    questionId: 'q1',
    status: 'answered',
    shownAt: index,
    answeredAt: index,
    marksEarned: earned,
    marksAvailable: 3,
    responseTimeSeconds: seconds,
  } as unknown as QuestionAttempt;
}

describe('summariseQuestion', () => {
  it('reports no record and pads the marks before any attempt', () => {
    const summary = summariseQuestion(question, []);
    expect(summary.marks).toEqual(['none', 'none', 'none', 'none', 'none']);
    expect(summary.record).toBeNull();
    expect(summary.marksAvailable).toBe(3);
    expect(summary.typicalSeconds).toBeNull();
  });

  it('keeps the latest five attempts, oldest first, and counts only full marks as right', () => {
    // Attempts 0 to 5: wrong, right, wrong, right, wrong, right. The oldest drops out.
    const attempts = [0, 1, 2, 3, 4, 5].map((index) => attempt(index, index % 2 ? 3 : 1, 60));
    const summary = summariseQuestion(question, attempts);
    expect(summary.marks).toEqual(['right', 'wrong', 'right', 'wrong', 'right']);
    expect(summary.record).toBe('Right 3 of the last 5');
  });

  it('ignores undone and unanswered attempts', () => {
    const undone = { ...attempt(1, 3), undoneAt: 9 };
    const shown = { ...attempt(2, 3), status: 'shown' } as QuestionAttempt;
    expect(summariseQuestion(question, [undone, shown]).record).toBeNull();
  });

  it('takes the median response time', () => {
    const summary = summariseQuestion(question, [
      attempt(1, 3, 30),
      attempt(2, 3, 90),
      attempt(3, 3, 600),
    ]);
    expect(summary.typicalSeconds).toBe(90);
  });
});

describe('formatQuestionMeta', () => {
  const base: QuestionBankSummary = {
    marks: [],
    record: null,
    marksAvailable: 3,
    typicalSeconds: 120,
  };
  it('joins marks and time, and drops what is missing', () => {
    expect(formatQuestionMeta(base)).toBe('3 marks · 2 min');
    expect(formatQuestionMeta({ ...base, typicalSeconds: null })).toBe('3 marks');
    expect(formatQuestionMeta({ ...base, marksAvailable: 1, typicalSeconds: 20 })).toBe(
      '1 mark · 20 s',
    );
    expect(formatQuestionMeta({ ...base, marksAvailable: null, typicalSeconds: null })).toBeNull();
  });
});

describe('highlightParameters', () => {
  it('bolds parameter values outside maths and whole tokens only', () => {
    expect(highlightParameters('A cell is 12 mm at x400, so $12 \\times 3$.', { a: 12 })).toBe(
      'A cell is **12** mm at x400, so $12 \\times 3$.',
    );
    expect(highlightParameters('Take 3.5 and 35, then 3.', { a: 3 })).toBe(
      'Take 3.5 and 35, then **3**.',
    );
  });
  it('returns the prompt unchanged without numeric parameters', () => {
    expect(highlightParameters('Hello 4', undefined)).toBe('Hello 4');
  });
});
