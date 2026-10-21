import { z } from 'zod';
import { JEV_MODEL, type JevChoiceRequest, type JevChoiceResult } from '../../src/jev/protocol.js';
export { JEV_MODEL } from '../../src/jev/protocol.js';

// Official wire contract: https://docs.typesafe.ai/api/system-one
// Pinned version: https://docs.typesafe.ai/models (checked 21 October 2026).
const responseSchema = z.object({
  model: z.literal(JEV_MODEL),
  answers: z.object({ decision: z.object({
    type: z.literal('choice'), choice: z.string(),
    confidence: z.number().min(0).max(1).nullable(),
    probabilities: z.record(z.string(), z.number().min(0).max(1)),
  }) }),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
});

export async function callJevChoice(
  request: JevChoiceRequest,
  apiKey: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<JevChoiceResult> {
  const response = await fetcher('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: JEV_MODEL, state: request.state, questions: {
      decision: { type: 'choice', instructions: request.instructions, criteria: request.options },
    } }),
    signal,
  });
  if (!response.ok) throw new Error('TypeSafe is unavailable.');
  const parsed = responseSchema.parse(await response.json());
  const decision = parsed.answers.decision;
  if (!Object.hasOwn(request.options, decision.choice)) throw new Error('TypeSafe returned an unknown choice.');
  return { choice: decision.choice, confidence: decision.confidence, model: parsed.model, inputTokens: parsed.usage.input_tokens };
}
