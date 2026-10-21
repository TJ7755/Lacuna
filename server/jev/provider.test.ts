import { expect, it, vi } from 'vitest';
import { callJevDecision } from './provider';

it('builds a fixed noul question from structured content and reads billable usage', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ model: 'jev-1.14.0', answers: { decision: { type: 'noul', noul: 0.97 } }, usage: { input_tokens: 120, output_tokens: 12 } }));
  expect(await callJevDecision({ purpose: 'typed-equivalence', prompt: 'What moves?', expected: 'Water', answer: 'Water molecules' }, 'secret', new AbortController().signal, fetcher)).toEqual({ model: 'jev-1.14.0', value: 1, confidence: 0.97, inputTokens: 120 });
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.typesafe.ai/v1/systemone');
  expect(JSON.parse(init.body)).toMatchObject({ model: 'jev-1.14.0', state: { prompt: 'What moves?', expected: 'Water', answer: 'Water molecules' }, questions: { decision: { type: 'noul' } } });
});
it('rounds expected scores only when the rounded level has concentrated probability', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ model: 'jev-1.14.0', answers: { decision: { type: 'score', score: 1.92, confidence: 0.93, probabilities: { '0': 0, '1': 0.08, '2': 0.92 } } }, usage: { input_tokens: 130, output_tokens: 12 } }));
  const request = { purpose: 'mark-allocation' as const, prompt: 'Explain', criterion: 'Two points', explanation: '', maxMarks: 2, answer: 'Two points' };
  expect(await callJevDecision(request, 'secret', new AbortController().signal, fetcher)).toMatchObject({ value: 2, confidence: 0.92 });
  fetcher.mockResolvedValue(Response.json({ model: 'jev-1.14.0', answers: { decision: { type: 'score', score: 1, confidence: 0.99, probabilities: { '0': 0.5, '1': 0, '2': 0.5 } } }, usage: { input_tokens: 130, output_tokens: 12 } }));
  expect(await callJevDecision(request, 'secret', new AbortController().signal, fetcher)).toMatchObject({ value: null, confidence: 0 });
});
