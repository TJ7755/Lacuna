import { expect, it, vi } from 'vitest';
import { callJevDecision, callJevAllocationBatch, callJevLessonDistractors } from './provider';
import type { JevAllocationInput } from '../../../web/src/jev/protocol';

it.each([
  {
    name: 'correct',
    answer: 'A mechanism and consequence',
    outcomes: ['no-gap', 'no-gap', 'no-gap'],
    expected: ['no-gap', 'no-gap', 'no-gap'],
    mark: 0.98,
    diagnosticConfidence: 0.99,
  },
  {
    name: 'knowledge gap',
    answer: 'An incorrect scientific fact',
    outcomes: ['gap', 'insufficient-evidence', 'insufficient-evidence'],
    expected: ['gap', 'insufficient-evidence', 'insufficient-evidence'],
    mark: 0.02,
    diagnosticConfidence: 0.99,
  },
  {
    name: 'technique gap',
    answer: 'Facts without a causal connection',
    outcomes: ['no-gap', 'no-gap', 'gap'],
    expected: ['no-gap', 'no-gap', 'gap'],
    mark: 0.02,
    diagnosticConfidence: 0.99,
  },
  {
    name: 'mixed gaps',
    answer: 'Mixed evidence',
    outcomes: ['gap', 'gap', 'gap'],
    expected: ['gap', 'gap', 'gap'],
    mark: 0.02,
    diagnosticConfidence: 0.99,
  },
  {
    name: 'uncertain cause',
    answer: 'Ambiguous evidence',
    outcomes: ['gap', 'gap', 'gap'],
    expected: ['insufficient-evidence', 'insufficient-evidence', 'insufficient-evidence'],
    mark: 0.02,
    diagnosticConfidence: 0.6,
  },
  {
    name: 'blank',
    answer: '   ',
    outcomes: ['gap', 'gap', 'gap'],
    expected: ['insufficient-evidence', 'insufficient-evidence', 'insufficient-evidence'],
    mark: 0.02,
    diagnosticConfidence: 0.99,
  },
  {
    name: 'uncertain mark',
    answer: 'A mechanism and consequence',
    outcomes: ['no-gap', 'no-gap', 'no-gap'],
    expected: ['no-gap', 'no-gap', 'no-gap'],
    mark: 0.5,
    diagnosticConfidence: 0.99,
  },
])(
  'combines marking and independent diagnosis in one call: $name',
  async ({ answer, outcomes, expected, mark, diagnosticConfidence }) => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        model: 'jev-1.14.0',
        answers: {
          allocation_0: { type: 'noul', noul: mark },
          allocation_1: { type: 'noul', noul: 0.98 },
          ...Object.fromEntries(
            ['knowledge', 'application', 'causal-link'].map((id, index) => [
              `allocation_0_diagnosis_${id}`,
              {
                type: 'choice',
                choice: outcomes[index],
                confidence: 0.999,
                probabilities: Object.fromEntries(
                  ['gap', 'no-gap', 'insufficient-evidence'].map((outcome) => [
                    outcome,
                    outcome === outcomes[index]
                      ? diagnosticConfidence
                      : (1 - diagnosticConfidence) / 2,
                  ]),
                ),
              },
            ]),
          ),
        },
        usage: { input_tokens: 432, output_tokens: 25 },
      }),
    );
    const allocation: JevAllocationInput = {
      prompt: 'Shared scientific question',
      answer,
      criterion: 'Unique scientific criterion',
      explanation: 'Unique rubric detail',
      maxMarks: 1,
      diagnostic: {
        taxonomyId: 'science-explanations',
        taxonomyVersion: 1,
        techniqueIds: ['causal-link'],
      },
    };
    const result = await callJevAllocationBatch(
      {
        purpose: 'mark-allocation',
        allocations: [
          allocation,
          {
            prompt: allocation.prompt,
            answer,
            criterion: 'Other mark',
            explanation: '',
            maxMarks: 1,
          },
        ],
      },
      'key',
      new AbortController().signal,
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.inputTokens).toBe(432);
    expect(result.decisions[0].value).toBe(mark === 0.5 ? null : mark > 0.5 ? 1 : 0);
    expect(result.decisions[0].diagnosis?.decisions.map((row) => row.outcome)).toEqual(expected);
    expect(result.decisions[0].diagnosis?.decisions[0].confidence).toBe(diagnosticConfidence);
    expect(result.decisions[1].diagnosis).toBeUndefined();
    const wire = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(wire.state.submissions).toEqual([{ prompt: allocation.prompt, answer }]);
    expect(wire.state.rubrics).toEqual([
      {
        criterion: allocation.criterion,
        explanation: allocation.explanation,
        maxMarks: 1,
        submissionIndex: 0,
      },
    ]);
    expect(fetcher.mock.calls[0][1].body.split(allocation.criterion)).toHaveLength(2);
    expect(Object.keys(wire.questions)).toHaveLength(5);
  },
);
const unknownKind = {
  type: 'choice',
  choice: 'same',
  confidence: 0.6,
  probabilities: { same: 0.6, spelling: 0.4, imprecise: 0, partial: 0, wrong: 0, blank: 0 },
};

it('diagnoses the requested techniques independently in the same provider request as the mark', async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      model: 'jev-1.14.0',
      answers: {
        allocation_0: { type: 'noul', noul: 0.02 },
        ...Object.fromEntries(
          [
            ['knowledge', 'no-gap'],
            ['application', 'no-gap'],
            ['causal-link', 'gap'],
            ['paired-comparison', 'no-gap'],
          ].map(([category, outcome]) => [
            `allocation_0_diagnosis_${category}`,
            {
              type: 'choice',
              choice: outcome,
              confidence: 0.99,
              probabilities: {
                gap: outcome === 'gap' ? 0.98 : 0.01,
                'no-gap': outcome === 'no-gap' ? 0.98 : 0.01,
                'insufficient-evidence': 0.01,
              },
            },
          ]),
        ),
      },
      usage: { input_tokens: 150, output_tokens: 20 },
    }),
  );
  const result = await callJevAllocationBatch(
    {
      purpose: 'mark-allocation',
      allocations: [
        {
          prompt: 'Compare and explain the two enzyme reactions.',
          criterion: 'Compare rates and explain the difference.',
          explanation: '',
          maxMarks: 1,
          answer: 'One reaction is faster than the other.',
          diagnostic: {
            taxonomyId: 'science-techniques',
            taxonomyVersion: 1,
            techniqueIds: ['causal-link', 'paired-comparison'],
          },
        },
      ],
    },
    'key',
    new AbortController().signal,
    fetcher,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.decisions[0]).toMatchObject({
    value: 0,
    diagnosis: {
      taxonomyId: 'science-techniques',
      decisions: [
        { categoryId: 'knowledge', outcome: 'no-gap' },
        { categoryId: 'application', outcome: 'no-gap' },
        { categoryId: 'causal-link', outcome: 'gap' },
        { categoryId: 'paired-comparison', outcome: 'no-gap' },
      ],
    },
  });
});

it('builds a fixed noul question from structured content and reads billable usage', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: { decision: { type: 'noul', noul: 0.97 }, kind: unknownKind },
      usage: { input_tokens: 120, output_tokens: 12 },
    }),
  );
  expect(
    await callJevDecision(
      {
        purpose: 'typed-equivalence',
        prompt: 'What moves?',
        expected: 'Water',
        answer: 'Water molecules',
      },
      'secret',
      new AbortController().signal,
      fetcher,
    ),
  ).toEqual({
    model: 'jev-1.14.0',
    value: 1,
    confidence: 0.97,
    inputTokens: 120,
    feedback: { kind: null, parts: [] },
  });
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.typesafe.ai/v1/systemone');
  expect(JSON.parse(init.body)).toMatchObject({
    model: 'jev-1.14.0',
    state: { prompt: 'What moves?', expected: 'Water', answer: 'Water molecules' },
    questions: { decision: { type: 'noul' } },
  });
});
it('selects an explicit mark level without averaging incompatible marks and abstains on split choices', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: {
        decision: {
          type: 'choice',
          choice: '2',
          confidence: 0.93,
          probabilities: { '0': 0, '1': 0.08, '2': 0.92 },
        },
      },
      usage: { input_tokens: 130, output_tokens: 12 },
    }),
  );
  const request = {
    purpose: 'mark-allocation' as const,
    prompt: 'Explain',
    criterion: 'Two points',
    explanation: '',
    maxMarks: 2,
    answer: 'Two points',
  };
  expect(
    await callJevDecision(request, 'secret', new AbortController().signal, fetcher),
  ).toMatchObject({ value: 2, confidence: 0.92 });
  fetcher.mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: {
        decision: {
          type: 'choice',
          choice: '0',
          confidence: 0.99,
          probabilities: { '0': 0.6, '1': 0, '2': 0.4 },
        },
      },
      usage: { input_tokens: 130, output_tokens: 12 },
    }),
  );
  expect(
    await callJevDecision(request, 'secret', new AbortController().signal, fetcher),
  ).toMatchObject({ value: 0, confidence: 0.6 });
  fetcher.mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: {
        decision: {
          type: 'choice',
          choice: '0',
          confidence: 0.99,
          probabilities: { '0': 0.5, '1': 0, '2': 0.5 },
        },
      },
      usage: { input_tokens: 130, output_tokens: 12 },
    }),
  );
  expect(
    await callJevDecision(request, 'secret', new AbortController().signal, fetcher),
  ).toMatchObject({ value: null, confidence: 0.5 });
});

it.each(
  (['mark', 'diagnosis', 'kind'] as const).flatMap((field) =>
    [0.99, 1.01, 0.98].map((sum) => ({ field, sum })),
  ),
)('checks rounded $field probabilities summing to $sum', async ({ field, sum }) => {
  const first = sum === 1.01 ? 0.99 : sum === 0.99 ? 0.98 : 0.97;
  const second = sum === 1.01 ? 0.02 : 0.01;
  const diagnostic = {
    taxonomyId: 'science-explanations' as const,
    taxonomyVersion: 1 as const,
    techniqueIds: ['causal-link' as const],
  };
  const answers: Record<string, unknown> = {
    decision:
      field === 'mark'
        ? {
            type: 'choice',
            choice: '0',
            confidence: 0.99,
            probabilities: { '0': first, '1': second, '2': 0 },
          }
        : { type: 'noul', noul: 0.01 },
  };
  if (field === 'diagnosis') {
    for (const category of ['knowledge', 'application', 'causal-link'])
      answers[`decision_diagnosis_${category}`] = {
        type: 'choice',
        choice: 'insufficient-evidence',
        confidence: 0.99,
        probabilities: { gap: second, 'no-gap': 0, 'insufficient-evidence': first },
      };
  }
  if (field === 'kind')
    answers.kind = {
      type: 'choice',
      choice: 'same',
      confidence: 0.99,
      probabilities: {
        same: first,
        spelling: second,
        imprecise: 0,
        partial: 0,
        wrong: 0,
        blank: 0,
      },
    };
  const fetcher = vi.fn(async () =>
    Response.json({
      model: 'jev-1.14.0',
      answers,
      usage: { input_tokens: 12, output_tokens: 1 },
    }),
  );
  const request =
    field === 'kind'
      ? {
          purpose: 'typed-equivalence' as const,
          prompt: 'Fixture',
          expected: 'Expected',
          answer: 'Written',
        }
      : {
          purpose: 'mark-allocation' as const,
          prompt: 'Fixture',
          criterion: 'Authored point',
          explanation: 'Fixture rubric',
          maxMarks: field === 'mark' ? 2 : 1,
          answer: 'Written',
          ...(field === 'diagnosis' ? { diagnostic } : {}),
        };
  const result = callJevDecision(request, 'synthetic-only', new AbortController().signal, fetcher);
  if (sum === 0.98) await expect(result).rejects.toThrow();
  else await expect(result).resolves.toMatchObject({ value: 0 });
});

it.each([
  [0.75, 1],
  [0.25, 0],
  [0.7499, null],
  [0.2501, null],
  [0.21, 0],
  [0.5, null],
])('uses the probability threshold for noul %s', async (noul, value) => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: { decision: { type: 'noul', noul }, kind: unknownKind },
      usage: { input_tokens: 12, output_tokens: 1 },
    }),
  );
  expect(
    await callJevDecision(
      { purpose: 'typed-equivalence', prompt: 'Q', expected: 'A', answer: 'B' },
      'key',
      new AbortController().signal,
      fetcher,
    ),
  ).toMatchObject({ value });
});
it('batches independent allocation questions over one shared answer with self-contained rubrics', async () => {
  const { callJevAllocationBatch } = await import('./provider');
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: {
        allocation_0: { type: 'noul', noul: 0.98 },
        allocation_1: {
          type: 'choice',
          choice: '2',
          confidence: 1,
          probabilities: { '0': 0, '1': 0, '2': 1 },
        },
      },
      usage: { input_tokens: 150, output_tokens: 12 },
    }),
  );
  const allocations = [
    {
      prompt: 'Describe osmosis.',
      answer: 'Water crosses a membrane down the water potential gradient.',
      criterion: 'Water moves',
      explanation: '',
      maxMarks: 1,
    },
    {
      prompt: 'Describe osmosis.',
      answer: 'Water crosses a membrane down the water potential gradient.',
      criterion: 'Membrane and gradient',
      explanation:
        'One mark for a partially permeable membrane; one for the water potential gradient.',
      maxMarks: 2,
    },
  ];
  const result = await callJevAllocationBatch(
    { purpose: 'mark-allocation', allocations },
    'key',
    new AbortController().signal,
    fetcher,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({
    inputTokens: 150,
    decisions: [
      { value: 1, confidence: 0.98 },
      { value: 2, confidence: 1 },
    ],
  });
  const wire = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(wire.state.submissions).toHaveLength(1);
  expect(wire.questions.allocation_0.instructions.context).toBe('submissions[0]');
  expect(wire.questions.allocation_0.criteria.true.criterion).toBe('Water moves');
  expect(Object.keys(wire.questions.allocation_1.criteria)).toEqual(['0', '1', '2']);
  for (const level of Object.values(wire.questions.allocation_1.criteria))
    expect(level).toMatchObject({
      criterion: 'Membrane and gradient',
      explanation: allocations[1].explanation,
    });
});

it('asks equivalence, answer kind and part coverage together while leaving grading to equivalence', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: {
        decision: { type: 'noul', noul: 0.5 },
        kind: {
          type: 'choice',
          choice: 'spelling',
          confidence: 0.9,
          probabilities: { same: 0, spelling: 0.9, imprecise: 0.1, partial: 0, wrong: 0, blank: 0 },
        },
        part_0: { type: 'noul', noul: 0.8 },
        part_1: { type: 'noul', noul: 0.2 },
        part_2: { type: 'noul', noul: 0.5 },
      },
      usage: { input_tokens: 609, output_tokens: 12 },
    }),
  );
  const result = await callJevDecision(
    {
      purpose: 'typed-equivalence',
      prompt: 'List the colours',
      expected: ' red, blue and green. ',
      answer: 'rad and green',
    },
    'key',
    new AbortController().signal,
    fetcher,
  );
  expect(result).toMatchObject({
    value: null,
    confidence: 0.5,
    feedback: {
      kind: 'spelling',
      parts: [
        { start: 1, end: 4, covered: true },
        { start: 6, end: 10, covered: false },
        { start: 15, end: 20, covered: null },
      ],
    },
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const wire = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(Object.keys(wire.questions)).toEqual(['decision', 'kind', 'part_0', 'part_1', 'part_2']);
  expect(wire.questions.kind).toMatchObject({
    type: 'choice',
    criteria: {
      same: 'Same meaning',
      spelling: 'Same meaning apart from a spelling slip',
      imprecise: 'Right idea but imprecise',
      partial: 'Partly right, with something missing or wrong',
      wrong: 'Wrong idea',
      blank: 'Blank or says they do not know',
    },
  });
  expect(wire.questions.part_0.criteria.true.expectedPart).toBe('red');
  expect(wire.questions.part_0.instructions).toContain('answer');
});

it.each([
  [undefined, 0.9, 1],
  [true, 0.9, 0],
  [true, 0.72, null],
] as const)(
  'marks the same spelling slip according to the author policy %s (kind confidence %s)',
  async (requireCorrectSpelling, confidence, value) => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        model: 'jev-1.14.0',
        answers: {
          decision: { type: 'noul', noul: 0.99 },
          kind: {
            type: 'choice',
            choice: 'spelling',
            confidence,
            probabilities: {
              same: 1 - confidence,
              spelling: confidence,
              imprecise: 0,
              partial: 0,
              wrong: 0,
              blank: 0,
            },
          },
        },
        usage: { input_tokens: 12, output_tokens: 1 },
      }),
    );
    const state = {
      prompt: 'Give the verb meaning to make room for',
      expected: 'accommodate',
      answer: 'acommodate',
    };
    const result = await callJevDecision(
      { purpose: 'typed-equivalence', ...state, requireCorrectSpelling },
      'key',
      new AbortController().signal,
      fetcher,
    );
    expect(result).toMatchObject({
      value,
      confidence: requireCorrectSpelling ? confidence : 0.99,
      feedback: { kind: 'spelling', parts: [] },
    });
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.state).toEqual(state);
    if (requireCorrectSpelling) {
      expect(request.questions.decision.instructions).toContain('with correct spelling');
      expect(request.questions.decision.criteria.false).toContain('spelling error');
    } else {
      expect(request.questions.decision.instructions).toContain('Judge meaning');
    }
  },
);

it.each([
  [0.6999, null],
  [0.7, 'same'],
] as const)(
  'uses kind confidence %s without changing the equivalence verdict',
  async (confidence, kind) => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        model: 'jev-1.14.0',
        answers: { decision: { type: 'noul', noul: 0.1 }, kind: { ...unknownKind, confidence } },
        usage: { input_tokens: 12, output_tokens: 1 },
      }),
    );
    expect(
      await callJevDecision(
        { purpose: 'typed-equivalence', prompt: 'Q', expected: 'A', answer: 'B' },
        'key',
        new AbortController().signal,
        fetcher,
      ),
    ).toMatchObject({ value: 0, feedback: { kind, parts: [] } });
  },
);
it.each([1, 8, 9])('asks coverage only for two to eight parts: %s', async (count) => {
  const fetcher = vi.fn(async (_url, init) => {
    const questions = JSON.parse(init.body).questions;
    return Response.json({
      model: 'jev-1.14.0',
      answers: Object.fromEntries(
        Object.keys(questions).map((key) => [
          key,
          key === 'kind' ? unknownKind : { type: 'noul', noul: 0.99 },
        ]),
      ),
      usage: { input_tokens: 12, output_tokens: 1 },
    });
  });
  const result = await callJevDecision(
    {
      purpose: 'typed-equivalence',
      prompt: 'Q',
      expected: Array.from({ length: count }, (_, index) => `Part ${index}`).join(', '),
      answer: 'A',
    },
    'key',
    new AbortController().signal,
    fetcher,
  );
  expect(result.feedback?.parts).toHaveLength(count === 8 ? 8 : 0);
  expect(Object.keys(JSON.parse(fetcher.mock.calls[0][1].body).questions)).toHaveLength(
    count === 8 ? 10 : 2,
  );
});

it('classifies every point against every technique and applies the two thresholds', async () => {
  const { callJevTechniqueClassification } = await import('./provider');
  const scores: Record<string, number> = {
    point_0_technique_0: 0.93,
    point_0_technique_1: 0.55,
    point_1_technique_0: 0.39,
    point_1_technique_1: 0.8,
  };
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: Object.fromEntries(
        Object.entries(scores).map(([key, noul]) => [key, { type: 'noul', noul }]),
      ),
      usage: { input_tokens: 210, output_tokens: 8 },
    }),
  );
  const point = (criterion: string) => ({
    prompt: 'A trolley travels 12 m in 4.8 s. Calculate its speed.',
    criterion,
    explanation: '',
    maxMarks: 1,
  });
  const result = await callJevTechniqueClassification(
    {
      purpose: 'technique-classification',
      techniques: [
        { id: 'calculation-setup', name: 'Set up a calculation' },
        { id: 'custom-abcdefgh1', name: 'Quote the data', description: 'Cite a table value.' },
      ],
      points: [point('Use speed = distance / time'), point('2.5 m/s')],
    },
    'key',
    new AbortController().signal,
    fetcher,
  );
  expect(result).toEqual({
    model: 'jev-1.14.0',
    inputTokens: 210,
    points: [
      { techniqueIds: ['calculation-setup'], suggestedIds: ['custom-abcdefgh1'] },
      { techniqueIds: ['custom-abcdefgh1'], suggestedIds: [] },
    ],
  });
  const wire = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(Object.keys(wire.questions)).toEqual(Object.keys(scores));
  expect(wire.questions.point_1_technique_0.instructions.context).toBe('points[1]; techniques[0]');
  // Identities stay on the server; the model sees only the content it judges.
  expect(wire.state.techniques).toEqual([
    { name: 'Set up a calculation' },
    { name: 'Quote the data', description: 'Cite a table value.' },
  ]);
  expect(wire.state.points).toHaveLength(2);
});

it('asks one lesson distractor Choice per target and filters the probability tail', async () => {
  const cards = [
    { prompt: 'Capital of France?', answer: 'Paris' },
    { answer: 'Lyon' },
    { answer: 'London' },
    { answer: 'Berlin' },
    { answer: 'Rome' },
    { answer: 'Brussels' },
    { answer: 'Amsterdam' },
    { answer: 'Madrid' },
    { answer: '  paris  ' },
  ];
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: {
        answer_0: {
          type: 'choice',
          choice: 'answer_1',
          confidence: 0.6,
          probabilities: {
            answer_1: 0.38,
            answer_2: 0.2,
            answer_3: 0.15,
            answer_4: 0.1,
            answer_5: 0.08,
            answer_6: 0.05,
            answer_7: 0.04,
          },
        },
      },
      usage: { input_tokens: 200, output_tokens: 8 },
    }),
  );
  const result = await callJevLessonDistractors(
    { purpose: 'lesson-distractors', cards, targets: [0] },
    'test-key',
    new AbortController().signal,
    fetcher,
  );
  const request = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(Object.keys(request.questions)).toEqual(['answer_0']);
  expect(Object.keys(request.questions.answer_0.criteria)).toEqual([
    'answer_1',
    'answer_2',
    'answer_3',
    'answer_4',
    'answer_5',
    'answer_6',
    'answer_7',
  ]);
  expect(request.state).toEqual({ cards });
  expect(result).toEqual({ model: 'jev-1.14.0', inputTokens: 200, rankings: [[1, 2, 3, 4]] });
});
