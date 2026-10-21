import { describe, expect, it, vi } from 'vitest';
import { callJevChoice, JEV_MODEL } from './provider';

describe('TypeSafe choice adapter', () => {
  it('uses the pinned direct API and parses confidence and billable input usage', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      model: 'jev-1.14.0', answers: { decision: { type: 'choice', choice: 'point', confidence: 0.94, probabilities: { point: 0.97, none: 0.03 } } },
      usage: { input_tokens: 120, output_tokens: 12 },
    }));
    const result = await callJevChoice({ state: 'Explain osmosis', instructions: 'Choose a point', options: { point: 'Osmosis', none: 'None of these' } }, 'secret', new AbortController().signal, fetcher);
    expect(result).toEqual({ choice: 'point', confidence: 0.94, inputTokens: 120, model: 'jev-1.14.0' });
    expect(fetcher).toHaveBeenCalledWith('https://api.typesafe.ai/v1/systemone', expect.objectContaining({
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: JEV_MODEL, state: 'Explain osmosis', questions: { decision: { type: 'choice', instructions: 'Choose a point', criteria: { point: 'Osmosis', none: 'None of these' } } } }),
    }));
  });
});
