import { expect, it, vi } from 'vitest';
import { callJevDecision } from './provider';

it('builds a fixed noul question from structured content and reads billable usage', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: { decision: { type: 'noul', noul: 0.97 } },
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
  ).toEqual({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 120 });
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
  [0.85, 1],
  [0.15, 0],
  [0.8499, null],
  [0.1501, null],
  [0.5, null],
])('uses the probability threshold for noul %s', async (noul, value) => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      model: 'jev-1.14.0',
      answers: { decision: { type: 'noul', noul } },
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
  const fetcher = vi
    .fn()
    .mockResolvedValue(
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
