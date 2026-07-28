import { describe, expect, it } from 'vitest';
import type { ItemPayload, LineVerdict } from '../db/types';
import { aggregateCriterionPerformance, aggregateMarkPerformance } from './marksAnalytics';

interface TestReview {
  marksEarned?: number;
  marksAvailable?: number;
  lineVerdicts?: LineVerdict[];
}

function card(history: TestReview[], payload?: ItemPayload) {
  return { history, payload };
}

describe('aggregateMarkPerformance', () => {
  it('aggregates marked attempts and ignores classic or malformed history', () => {
    expect(
      aggregateMarkPerformance([
        card([
          { marksEarned: 2, marksAvailable: 3 },
          {},
          { marksEarned: 4, marksAvailable: 3 },
          { marksEarned: Number.NaN, marksAvailable: 1 },
        ]),
        card([{ marksEarned: 1, marksAvailable: 1 }]),
      ]),
    ).toEqual({
      reviewedAttempts: 2,
      marksEarned: 3,
      marksAvailable: 4,
      attainmentRate: 0.75,
    });
  });

  it('reports no rate when there are no marked attempts', () => {
    expect(aggregateMarkPerformance([card([{}])])).toEqual({
      reviewedAttempts: 0,
      marksEarned: 0,
      marksAvailable: 0,
      attainmentRate: null,
    });
  });
});

describe('aggregateCriterionPerformance', () => {
  it('groups labelled working criteria across cards and counts missed attempts', () => {
    const firstPayload: ItemPayload = {
      v: 1,
      kind: 'working',
      scheme: [
        { marks: 1, label: 'substitution', kind: 'waypoint', expression: '2x = 8' },
        { marks: 2, label: 'solve', kind: 'predicate', predicate: 'equals', args: ['4'] },
      ],
    };
    const secondPayload: ItemPayload = {
      v: 1,
      kind: 'working',
      scheme: [{ marks: 1, label: 'solve', kind: 'predicate', predicate: 'equals', args: ['9'] }],
    };

    const result = aggregateCriterionPerformance([
      card(
        [
          {
            marksEarned: 3,
            marksAvailable: 3,
            lineVerdicts: [
              { studentLine: '2x = 8', matchedLineIndex: 0, marksEarned: 1 },
              { studentLine: '4', matchedLineIndex: 1, marksEarned: 2 },
            ],
          },
          {
            marksEarned: 1,
            marksAvailable: 3,
            lineVerdicts: [{ studentLine: '2x = 8', matchedLineIndex: 0, marksEarned: 1 }],
          },
        ],
        firstPayload,
      ),
      card([{ marksEarned: 0, marksAvailable: 1, lineVerdicts: [] }], secondPayload),
    ]);

    expect(result).toEqual([
      {
        label: 'solve',
        reviewedAttempts: 3,
        fullyEarnedAttempts: 1,
        missedAttempts: 2,
        marksEarned: 2,
        marksAvailable: 5,
        attainmentRate: 0.4,
      },
      {
        label: 'substitution',
        reviewedAttempts: 2,
        fullyEarnedAttempts: 2,
        missedAttempts: 0,
        marksEarned: 2,
        marksAvailable: 2,
        attainmentRate: 1,
      },
    ]);
  });

  it('combines repeated labels within one attempt and clamps malformed verdict marks', () => {
    const payload: ItemPayload = {
      v: 1,
      kind: 'working',
      scheme: [
        { marks: 1, label: 'method', kind: 'waypoint', expression: 'a' },
        { marks: 2, label: 'method', kind: 'waypoint', expression: 'b' },
        { marks: 1, kind: 'waypoint', expression: 'unlabelled' },
      ],
    };

    expect(
      aggregateCriterionPerformance([
        card(
          [
            {
              marksEarned: 3,
              marksAvailable: 4,
              lineVerdicts: [
                { studentLine: 'a', matchedLineIndex: 0, marksEarned: 99 },
                { studentLine: 'outside', matchedLineIndex: 20, marksEarned: 10 },
                { studentLine: 'unmatched', matchedLineIndex: null, marksEarned: 0 },
              ],
            },
          ],
          payload,
        ),
      ]),
    ).toEqual([
      {
        label: 'method',
        reviewedAttempts: 1,
        fullyEarnedAttempts: 0,
        missedAttempts: 1,
        marksEarned: 1,
        marksAvailable: 3,
        attainmentRate: 1 / 3,
      },
    ]);
  });

  it('ignores non-working payloads and reviews without persisted line verdicts', () => {
    expect(
      aggregateCriterionPerformance([
        card([{ marksEarned: 1, marksAvailable: 1 }], {
          v: 1,
          kind: 'numeric',
          answer: { kind: 'exact', value: '4' },
        }),
      ]),
    ).toEqual([]);
  });
});
