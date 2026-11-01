import { expect, it } from 'vitest';
import { auditQuestionClassifications } from './classificationAudit';
import type { MarkAllocation, QuestionSet } from '@lacuna/core/questions/questionSets';

it('counts criterion attribution and distinct Questions without conflating taxonomies or learner evidence', () => {
  const point = (
    id: string,
    conceptIds: string[],
    techniqueIds?: ('causal-link' | 'paired-comparison')[],
  ): MarkAllocation => ({
    id,
    criterion: id,
    maxMarks: 1,
    dimension: 'mixed',
    targetConceptIds: conceptIds,
    ...(techniqueIds
      ? {
          techniqueTags: {
            taxonomyId: 'science-techniques',
            taxonomyVersion: 1,
            techniqueIds,
            provenance: { source: 'author' },
          },
        }
      : {}),
  });
  const legacy = point('legacy', ['a'], ['causal-link']);
  legacy.techniqueTags!.taxonomyId = 'science-explanations';
  const answer = (allocations: MarkAllocation[]) => ({
    maxMarks: allocations.length,
    response: { kind: 'written' as const },
    prerequisiteConceptIds: [],
    allocations,
  });
  const set: QuestionSet = {
    id: 'set',
    courseId: 'course',
    title: 'Demands',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      { id: 'q1', prompt: 'First', parts: [], answer: answer([point('unclassified', []), legacy]) },
      {
        id: 'q2',
        prompt: 'Second',
        parts: [
          {
            id: 'part',
            prompt: 'Part',
            subparts: [
              {
                id: 'subpart',
                prompt: 'Subpart',
                answer: answer([point('second-causal-link', ['a'], ['causal-link'])]),
              },
            ],
            answer: answer([
              point('multi', ['a', 'b'], ['causal-link', 'paired-comparison']),
              point('none', ['unknown'], []),
            ]),
          },
        ],
      },
      {
        id: 'q3',
        prompt: 'Third',
        parts: [],
        answer: answer([point('third-causal-link', ['a'], ['causal-link'])]),
      },
    ],
  };
  const before = structuredClone(set);
  const report = auditQuestionClassifications(
    [set],
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  );
  expect(report.totals).toEqual({ concepts: 2, sets: 1, questions: 3, criteria: 6 });
  expect(report.conceptLinks).toEqual({ unlinked: 1, single: 4, combined: 1, unresolved: 1 });
  expect(report.techniqueClassifications).toEqual({ unclassified: 1, explicitNone: 1, tagged: 4 });
  expect(report.techniques.filter((row) => row.techniqueId === 'causal-link')).toMatchObject([
    { taxonomyId: 'science-explanations', criteria: 1, questions: 1 },
    { taxonomyId: 'science-techniques', criteria: 3, questions: 2 },
  ]);
  expect(report.criteria.find((row) => row.allocationId === 'none')?.concepts).toEqual([
    { id: 'unknown', name: null },
  ]);
  expect(set).toEqual(before);
});
