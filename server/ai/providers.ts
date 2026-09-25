import { createGateway, type GatewayModelEntry } from '@ai-sdk/gateway';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export interface HostedModelRoute {
  id: string;
  model: LanguageModel;
}

/** Model IDs are fixed here so a request or deployment variable cannot select a paid route. */
export function isZeroPricedGatewayModel(model: Pick<GatewayModelEntry, 'pricing'> | undefined): boolean {
  return !!model && model.pricing !== null && model.pricing !== undefined &&
    /^0(?:\.0+)?$/.test(model.pricing.input) && /^0(?:\.0+)?$/.test(model.pricing.output);
}

export async function configuredFreeModels(env: NodeJS.ProcessEnv): Promise<HostedModelRoute[]> {
  const routes: HostedModelRoute[] = [];
  if (env.AI_GATEWAY_API_KEY) {
    const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });
    try {
      const catalogue = await gateway.getAvailableModels();
      if (isZeroPricedGatewayModel(catalogue.models.find((model) => model.id === 'minimax/minimax-m3-free'))) {
        routes.push({ id: 'gateway:minimax/minimax-m3-free', model: gateway('minimax/minimax-m3-free') });
      }
    } catch {
      // A missing catalogue must never turn a zero-cost route into an assumed one.
    }
  }
  if (env.OPENROUTER_API_KEY) {
    const openrouter = createOpenAICompatible({
      name: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: env.OPENROUTER_API_KEY,
    });
    routes.push({ id: 'openrouter:openrouter/free', model: openrouter.chatModel('openrouter/free') });
  }
  if (env.GOOGLE_GENERATIVE_AI_API_KEY && env.AI_GOOGLE_FREE_TIER_CONFIRMED === '1') {
    const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
    routes.push({ id: 'google:gemini-2.5-flash-lite', model: google('gemini-2.5-flash-lite') });
  }
  return routes;
}
