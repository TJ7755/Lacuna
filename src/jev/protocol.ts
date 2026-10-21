import { z } from 'zod';

export const JEV_MODEL = 'jev-1.14.0';
export const JEV_TYPED_CORRECT_THRESHOLD = 0.85;
export const JEV_TYPED_INCORRECT_THRESHOLD = 0.85;
export const JEV_ALLOCATION_CONFIDENCE_THRESHOLD = 0.85;
const text = z.string().max(12_000);
// Only these purposes are executable; future purposes require a new validated branch.
export const jevDecisionRequestSchema = z.discriminatedUnion('purpose', [
  z.strictObject({ purpose: z.literal('typed-equivalence'), prompt: text.min(1), expected: text.min(1), answer: text }),
  z.strictObject({ purpose: z.literal('mark-allocation'), prompt: text.min(1), criterion: text.min(1), explanation: text, maxMarks: z.number().int().min(1).max(9), answer: text }),
]);
export type JevDecisionRequest = z.infer<typeof jevDecisionRequestSchema>;
export const jevDecisionResultSchema = z.strictObject({
  value: z.number().int().min(0).max(9).nullable(),
  confidence: z.number().min(0).max(1),
  inputTokens: z.number().int().nonnegative(),
  model: z.literal(JEV_MODEL),
});
export type JevDecisionResult = z.infer<typeof jevDecisionResultSchema>;
export type JevDecisionClient = (request: JevDecisionRequest, signal: AbortSignal) => Promise<JevDecisionResult>;
