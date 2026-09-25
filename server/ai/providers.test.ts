import { describe, expect, it, vi } from 'vitest';
import {
  configuredFreeModels,
  isZeroPricedGatewayModel,
  isZeroPricedOpenRouterFreeRoute,
  selectFreeGatewayModels,
} from './providers';

vi.mock('@ai-sdk/gateway', () => ({
  createGateway: () => Object.assign(() => ({}), {
    getAvailableModels: async () => ({ models: [
      { id: 'poolside/laguna-s-2.1-free', modelType: 'language', pricing: { input: '0', output: '0' } },
    ] }),
  }),
}));

describe('hosted provider policy', () => {
  it('requires explicit zero input and output prices before selecting a Gateway model', () => {
    expect(isZeroPricedGatewayModel({ pricing: { input: '0', output: '0.0000' } })).toBe(true);
    expect(isZeroPricedGatewayModel({})).toBe(false);
    expect(isZeroPricedGatewayModel({ pricing: { input: '0', output: '0.01' } })).toBe(false);
    expect(isZeroPricedGatewayModel({ pricing: { input: '0', output: '0', cachedInputTokens: '0.01' } })).toBe(false);
  });

  it('selects only pinned free language routes at zero input and output price', () => {
    const available = [
      { id: 'poolside/laguna-s-2.1-free', modelType: 'language' as const, pricing: { input: '0', output: '0' } },
      { id: 'inclusionai/ling-3.0-flash-fin', modelType: 'language' as const, pricing: { input: '0', output: '0' } },
      { id: 'minimax/minimax-m3-free', modelType: 'language' as const, pricing: { input: '0', output: '0' } },
    ];
    expect(selectFreeGatewayModels(available)).toEqual([
      'inclusionai/ling-3.0-flash-fin',
      'poolside/laguna-s-2.1-free',
    ]);
    expect(selectFreeGatewayModels([{ ...available[0]!, pricing: { input: '0', output: '0.01' } }])).toEqual([]);
    expect(selectFreeGatewayModels([{ ...available[0]!, modelType: 'image' as const }])).toEqual([]);
    expect(selectFreeGatewayModels([])).toEqual([]);
  });

  it('requires live zero pricing and tool support for the OpenRouter free route', async () => {
    const free = { id: 'openrouter/free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] };
    expect(isZeroPricedOpenRouterFreeRoute(free)).toBe(true);
    expect(isZeroPricedOpenRouterFreeRoute({ ...free, pricing: { prompt: '0', completion: '0.01' } })).toBe(false);
    expect(isZeroPricedOpenRouterFreeRoute({ ...free, pricing: { prompt: '0', completion: '0', request: '0.01' } })).toBe(false);
    expect(isZeroPricedOpenRouterFreeRoute({ ...free, supported_parameters: [] })).toBe(false);
    const catalogue = (model: unknown) => async () => new Response(JSON.stringify({ data: [model] }));
    expect((await configuredFreeModels({ OPENROUTER_API_KEY: 'fixture' }, catalogue(free) as typeof fetch))
      .map((route) => route.id)).toEqual(['openrouter:openrouter/free']);
    expect((await configuredFreeModels({
      AI_GATEWAY_API_KEY: 'fixture', OPENROUTER_API_KEY: 'fixture',
    }, catalogue(free) as typeof fetch)).map((route) => route.id)).toEqual([
      'openrouter:openrouter/free', 'gateway:poolside/laguna-s-2.1-free',
    ]);
    expect(await configuredFreeModels({ OPENROUTER_API_KEY: 'fixture' },
      catalogue({ ...free, pricing: { prompt: '0', completion: '0.01' } }) as typeof fetch)).toEqual([]);
  });

  it('prefers pinned zero-priced tool models to the random free router', async () => {
    const model = (id: string, completion = '0', tools = true) => ({
      id, pricing: { prompt: '0', completion }, supported_parameters: tools ? ['tools'] : [],
    });
    const catalogue = (data: unknown[]) => async () => new Response(JSON.stringify({ data }));
    const routes = await configuredFreeModels({ OPENROUTER_API_KEY: 'fixture' }, catalogue([
      model('inclusionai/ling-3.0-flash-fin:free'),
      model('openrouter/free'),
      model('inclusionai/ling-3.0-flash-sante:free'),
      model('inclusionai/ling-3.0-flash-sante', '0.01'),
    ]) as typeof fetch);
    expect(routes.map((route) => route.id)).toEqual([
      'openrouter:inclusionai/ling-3.0-flash-sante:free',
      'openrouter:inclusionai/ling-3.0-flash-fin:free',
      'openrouter:openrouter/free',
    ]);
    const paidOrNoTools = await configuredFreeModels({ OPENROUTER_API_KEY: 'fixture' }, catalogue([
      model('inclusionai/ling-3.0-flash-sante:free', '0.01'),
      model('inclusionai/ling-3.0-flash-fin:free', '0', false),
    ]) as typeof fetch);
    expect(paidOrNoTools).toEqual([]);
  });

  it('offers only named free routes and requires confirmation for a Gemini free-tier key', async () => {
    expect(await configuredFreeModels({})).toEqual([]);
    const routes = await configuredFreeModels({
      OPENROUTER_API_KEY: 'fixture',
      GOOGLE_GENERATIVE_AI_API_KEY: 'fixture',
    }, (async () => new Response(JSON.stringify({ data: [
      { id: 'openrouter/free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
    ] }))) as typeof fetch);
    expect(routes.map((route) => route.id)).toEqual(['openrouter:openrouter/free']);
    const confirmed = await configuredFreeModels({
      GOOGLE_GENERATIVE_AI_API_KEY: 'fixture',
      AI_GOOGLE_FREE_TIER_CONFIRMED: '1',
    });
    expect(confirmed.map((route) => route.id)).toEqual(['google:gemini-2.5-flash-lite']);
  });
});
