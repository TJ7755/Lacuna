import { expect, it } from 'vitest';
import type { ConceptPracticeItem } from '../questions/conceptPractice';
import { buildQuestionEvidence } from './questionEvidence';

function item(
  conceptId: string,
  diagnosticEvidence: ConceptPracticeItem['diagnosticEvidence'],
  unseenCount = 0,
): ConceptPracticeItem {
  return {
    conceptId,
    name: conceptId,
    schedule: {
      stability: null,
      difficulty: null,
      lastReviewed: null,
      reps: 0,
      lapses: 0,
      state: 0,
      due: null,
      scheduledDays: 0,
      learningSteps: 0,
    },
    due: true,
    unseenCount,
    familiarCount: 0,
    availableCount: unseenCount,
    ...(diagnosticEvidence ? { diagnosticEvidence } : {}),
  };
}

const evidence = (
  categoryId: 'knowledge' | 'application' | 'causal-link',
  demonstratedCount: number,
  gapCount: number,
  latestOutcome: 'gap' | 'demonstrated',
) => ({ categoryId, demonstratedCount, gapCount, lastObservedAt: 1, latestOutcome });

it('keeps knowledge, application and technique evidence apart within the scope', () => {
  const report = buildQuestionEvidence(
    [
      item(
        'enzymes',
        [
          evidence('knowledge', 2, 0, 'demonstrated'),
          evidence('application', 1, 1, 'gap'),
          evidence('causal-link', 0, 2, 'gap'),
        ],
        3,
      ),
      item('cells', [evidence('knowledge', 0, 1, 'gap')], 1),
      item('thin', undefined, 4),
      item('outside', [evidence('knowledge', 0, 5, 'gap')], 9),
    ],
    ['enzymes', 'cells', 'thin', 'no-questions'],
  );

  expect(report).toEqual({
    // 'no-questions' has no course topic, so it is not counted.
    topics: 3,
    topicsWithEvidence: 2,
    rows: [
      { id: 'knowledge', name: 'Knowledge', demonstrated: 2, gaps: 1, topicsWithGap: 1 },
      { id: 'application', name: 'Application', demonstrated: 1, gaps: 1, topicsWithGap: 1 },
      {
        id: 'causal-link',
        name: 'Link cause and effect',
        demonstrated: 0,
        gaps: 2,
        topicsWithGap: 1,
      },
    ],
  });
});

it('reports no rows rather than gaps when no answer has been marked', () => {
  const report = buildQuestionEvidence([item('thin', undefined, 2)], ['thin']);
  expect(report.rows).toEqual([]);
  expect(report.topicsWithEvidence).toBe(0);
});
