import { describe, expect, it } from 'vitest';
import { reviewFeedbackMessage } from './gradingFeedback';

const NOW = Date.parse('2026-08-31T10:00:00Z');

describe('reviewFeedbackMessage', () => {
  it.each([
    [1, NOW + 60_000, 'Again · retry in 1 minute'],
    [2, NOW + 4 * 60 * 60_000, 'Hard · again in 4 hours'],
    [3, NOW + 4 * 24 * 60 * 60_000, 'Good · again in 4 days'],
    [4, NOW + 60 * 24 * 60 * 60_000, 'Easy · again in 2 months'],
  ] as const)('describes grade %s and its next interval', (grade, due, expected) => {
    expect(reviewFeedbackMessage(grade, due, NOW)).toBe(expected);
  });
});
