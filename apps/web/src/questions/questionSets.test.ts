import { describe, expect, it } from 'vitest';
import {
  summariseSelfMarking,
  validateQuestionSet,
  type QuestionSet,
  type SelfMarkDecision,
} from './questionSets';

function questionSet(): QuestionSet {
  return {
    id: 'set-1',
    courseId: 'course-1',
    title: 'Cells and reactions',
    lessonIds: ['lesson-1'],
    assessmentIds: ['assessment-1'],
    questions: [
      {
        id: 'question-1',
        prompt: 'Use this diagram: ![Cell](lacuna-asset://cell)',
        parts: [
          {
            id: 'part-a',
            prompt: 'Consider the labelled structure.',
            subparts: [
              {
                id: 'subpart-i',
                prompt: 'Name it and explain its role.',
                answer: {
                  maxMarks: 3,
                  response: { kind: 'written' },
                  prerequisiteConceptIds: ['concept-prerequisite'],
                  allocations: [
                    {
                      id: 'allocation-knowledge',
                      criterion: 'Names the structure.',
                      maxMarks: 1,
                      dimension: 'knowledge',
                      targetConceptIds: ['concept-a', 'concept-b'],
                    },
                    {
                      id: 'allocation-application',
                      criterion: 'Explains its role.',
                      maxMarks: 2,
                      dimension: 'application',
                      targetConceptIds: ['concept-a'],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      {
        id: 'question-2',
        prompt: 'Choose the products.',
        parts: [],
        answer: {
          maxMarks: 2,
          response: {
            kind: 'multiple-choice',
            selection: 'multiple',
            options: [
              { id: 'option-a', content: 'Water' },
              { id: 'option-b', content: 'Oxygen' },
              { id: 'option-c', content: 'Nitrogen' },
            ],
            correctOptionIds: ['option-a', 'option-b'],
          },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'allocation-mixed',
              criterion: 'Selects both products.',
              maxMarks: 2,
              dimension: 'mixed',
              targetConceptIds: [],
            },
          ],
        },
      },
    ],
  };
}

describe('validateQuestionSet', () => {
  it('accepts an ordered three-level set with shared Markdown and multi-concept links', () => {
    expect(validateQuestionSet(questionSet())).toEqual([]);
  });

  it('rejects duplicate identities, scored parents, and a fourth nesting level', () => {
    const set = questionSet();
    set.questions[1].id = 'question-1';
    set.questions[0].answer = structuredClone(set.questions[1].answer);
    (set.questions[0].parts[0].subparts[0] as unknown as { parts: unknown[] }).parts = [];

    expect(validateQuestionSet(set).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['duplicate-id', 'scored-parent', 'invalid-depth']),
    );
  });

  it('rejects misplaced nested collections and unsafe aggregate totals', () => {
    const set = questionSet();
    (set.questions[0] as unknown as { subparts: unknown[] }).subparts = [];
    (set.questions[0].parts[0] as unknown as { parts: unknown[] }).parts = [];
    const answer = set.questions[1].answer!;
    answer.maxMarks = Number.MAX_SAFE_INTEGER;
    answer.allocations[0].maxMarks = Number.MAX_SAFE_INTEGER;
    const firstAnswer = set.questions[0].parts[0].subparts[0].answer!;
    firstAnswer.maxMarks = Number.MAX_SAFE_INTEGER;
    firstAnswer.allocations = [
      {
        id: 'allocation-huge',
        criterion: 'Explains the answer.',
        maxMarks: Number.MAX_SAFE_INTEGER,
        dimension: 'application',
        targetConceptIds: [],
      },
    ];

    expect(validateQuestionSet(set).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['invalid-depth', 'invalid-marks']),
    );
  });

  it('rejects invalid mark values and allocation totals', () => {
    const set = questionSet();
    const allocations = set.questions[0].parts[0].subparts[0].answer!.allocations;
    allocations[0].maxMarks = Number.POSITIVE_INFINITY;
    allocations[1].maxMarks = -1;
    set.questions[1].answer!.maxMarks = 3;

    expect(validateQuestionSet(set).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['invalid-marks', 'allocation-total-mismatch']),
    );
  });

  it('rejects malformed multiple-choice options and empty answerable content', () => {
    const set = questionSet();
    set.questions[0].parts[0].subparts[0].prompt = '';
    const response = set.questions[1].answer!.response;
    if (response.kind !== 'multiple-choice') throw new Error('Expected multiple choice');
    response.options[1].id = 'option-a';
    response.correctOptionIds = ['missing'];

    expect(validateQuestionSet(set).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['missing-prompt', 'duplicate-id', 'invalid-options']),
    );
  });
});

describe('summariseSelfMarking', () => {
  it('keeps partial results provisional and counts zero, unsure, and unmarked separately', () => {
    const decisions: SelfMarkDecision[] = [
      { allocationId: 'allocation-knowledge', status: 'awarded', marks: 0 },
      { allocationId: 'allocation-application', status: 'awarded', marks: 1 },
      { allocationId: 'allocation-mixed', status: 'unsure' },
    ];
    const summary = summariseSelfMarking(questionSet(), decisions);

    expect(summary).toMatchObject({
      status: 'provisional',
      total: { awarded: 1, available: 5 },
      resolvedCount: 2,
      unsureCount: 1,
      unmarkedCount: 0,
      dimensions: {
        knowledge: { awarded: 0, available: 1 },
        application: { awarded: 1, available: 2 },
        mixed: { awarded: 0, available: 2 },
      },
    });
    expect(summariseSelfMarking(questionSet(), decisions.slice(0, 2)).unmarkedCount).toBe(1);
  });

  it('completes a fully marked zero result without duplicating multi-concept marks', () => {
    const summary = summariseSelfMarking(questionSet(), [
      { allocationId: 'allocation-knowledge', status: 'awarded', marks: 0 },
      { allocationId: 'allocation-application', status: 'awarded', marks: 0 },
      { allocationId: 'allocation-mixed', status: 'awarded', marks: 0 },
    ]);

    expect(summary.status).toBe('complete');
    expect(summary.total).toEqual({ awarded: 0, available: 5 });
    expect(summary.unmarkedCount).toBe(0);
    expect(summary.unsureCount).toBe(0);
  });

  it('rejects duplicate, unknown, non-finite, negative and excessive awards', () => {
    const set = questionSet();
    const invalidDecisions: SelfMarkDecision[][] = [
      [
        { allocationId: 'allocation-knowledge', status: 'awarded', marks: 0 },
        { allocationId: 'allocation-knowledge', status: 'unsure' },
      ],
      [{ allocationId: 'missing', status: 'awarded', marks: 0 }],
      [{ allocationId: 'allocation-knowledge', status: 'awarded', marks: Number.NaN }],
      [{ allocationId: 'allocation-knowledge', status: 'awarded', marks: -1 }],
      [{ allocationId: 'allocation-knowledge', status: 'awarded', marks: 2 }],
    ];

    for (const decisions of invalidDecisions) {
      expect(() => summariseSelfMarking(set, decisions)).toThrow();
    }
  });
});
