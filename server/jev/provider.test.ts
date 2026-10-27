import { expect, it, vi } from 'vitest';
import { callJevDecision, callJevAllocationBatch } from './provider';
import type { JevAllocationInput } from '../../src/jev/protocol';

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
it('rounds expected scores only when the rounded level has concentrated probability', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: {
        decision: {
          type: 'score',
          score: 1.92,
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
          type: 'score',
          score: 1,
          confidence: 0.99,
          probabilities: { '0': 0.5, '1': 0, '2': 0.5 },
        },
      },
      usage: { input_tokens: 130, output_tokens: 12 },
    }),
  );
  expect(
    await callJevDecision(request, 'secret', new AbortController().signal, fetcher),
  ).toMatchObject({ value: null, confidence: 0 });
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
          type: 'score',
          score: 2,
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
  expect(wire.questions.allocation_1.criteria).toHaveLength(3);
  for (const level of wire.questions.allocation_1.criteria)
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
