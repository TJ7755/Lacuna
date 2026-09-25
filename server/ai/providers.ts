import { createGateway, type GatewayModelEntry } from '@ai-sdk/gateway';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export interface HostedModelRoute {
  id: string;
  model: LanguageModel;
}

const FREE_GATEWAY_MODEL_IDS = [
  'inclusionai/ling-3.0-flash-fin',
  'poolside/laguna-s-2.1-free',
] as const;

/** Model IDs are fixed here so a request or deployment variable cannot select a paid route. */
export function isZeroPricedGatewayModel(model: Pick<GatewayModelEntry, 'pricing'> | undefined): boolean {
  return !!model && model.pricing !== null && model.pricing !== undefined &&
    /^0(?:\.0+)?$/.test(model.pricing.input) && /^0(?:\.0+)?$/.test(model.pricing.output) &&
    Object.values(model.pricing).every((price) => typeof price === 'string' && /^0(?:\.0+)?$/.test(price));
}

export function selectFreeGatewayModels(
  models: readonly Pick<GatewayModelEntry, 'id' | 'modelType' | 'pricing'>[],
): string[] {
  return FREE_GATEWAY_MODEL_IDS.filter((id) => {
    const model = models.find((candidate) => candidate.id === id && candidate.modelType === 'language');
    return isZeroPricedGatewayModel(model);
  });
}

export function isZeroPricedOpenRouterFreeRoute(model: unknown): boolean {
  if (!model || typeof model !== 'object') return false;
  const candidate = model as { id?: unknown; pricing?: unknown; supported_parameters?: unknown };
  if (candidate.id !== 'openrouter/free' || !Array.isArray(candidate.supported_parameters) ||
      !candidate.supported_parameters.includes('tools') || !candidate.pricing ||
      typeof candidate.pricing !== 'object') return false;
  const pricing = candidate.pricing as Record<string, unknown>;
  return pricing.prompt === '0' && pricing.completion === '0' &&
    Object.values(pricing).every((price) => typeof price === 'string' && /^0(?:\.0+)?$/.test(price));
}

export async function configuredFreeModels(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
): Promise<HostedModelRoute[]> {
  const routes: HostedModelRoute[] = [];
  if (env.OPENROUTER_API_KEY) {
    try {
      const response = await fetcher('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error('OpenRouter catalogue is unavailable.');
      const catalogue = await response.json() as { data?: unknown };
      if (Array.isArray(catalogue.data) && catalogue.data.some(isZeroPricedOpenRouterFreeRoute)) {
        const openrouter = createOpenAICompatible({
          name: 'openrouter',
          baseURL: 'https://openrouter.ai/api/v1',
          apiKey: env.OPENROUTER_API_KEY,
        });
        routes.push({ id: 'openrouter:openrouter/free', model: openrouter.chatModel('openrouter/free') });
      }
    } catch {
      // A missing catalogue must not make the free router an assumed zero-cost route.
    }
  }
  if (env.AI_GATEWAY_API_KEY) {
    const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });
    try {
      const catalogue = await gateway.getAvailableModels();
      for (const modelId of selectFreeGatewayModels(catalogue.models)) {
        routes.push({ id: `gateway:${modelId}`, model: gateway(modelId) });
      }
    } catch {
      // A missing catalogue must never turn a zero-cost route into an assumed one.
    }
  }
  if (env.GOOGLE_GENERATIVE_AI_API_KEY && env.AI_GOOGLE_FREE_TIER_CONFIRMED === '1') {
    const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
    routes.push({ id: 'google:gemini-2.5-flash-lite', model: google('gemini-2.5-flash-lite') });
  }
  return routes;
}
