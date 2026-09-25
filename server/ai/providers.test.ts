import { describe, expect, it } from 'vitest';
import { configuredFreeModels, isZeroPricedGatewayModel } from './providers';

describe('hosted provider policy', () => {
  it('requires explicit zero input and output prices before selecting a Gateway model', () => {
    expect(isZeroPricedGatewayModel({ pricing: { input: '0', output: '0.0000' } })).toBe(true);
    expect(isZeroPricedGatewayModel({})).toBe(false);
    expect(isZeroPricedGatewayModel({ pricing: { input: '0', output: '0.01' } })).toBe(false);
  });

  it('offers only named free routes and requires confirmation for a Gemini free-tier key', async () => {
    expect(await configuredFreeModels({})).toEqual([]);
    const routes = await configuredFreeModels({
      OPENROUTER_API_KEY: 'fixture',
      GOOGLE_GENERATIVE_AI_API_KEY: 'fixture',
    });
    expect(routes.map((route) => route.id)).toEqual(['openrouter:openrouter/free']);
    const confirmed = await configuredFreeModels({
      GOOGLE_GENERATIVE_AI_API_KEY: 'fixture',
      AI_GOOGLE_FREE_TIER_CONFIRMED: '1',
    });
    expect(confirmed.map((route) => route.id)).toEqual(['google:gemini-2.5-flash-lite']);
  });
});
