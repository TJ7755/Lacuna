import { z } from 'zod';

export const JEV_MODEL = 'jev-1.14.0';
export const JEV_CONFIDENCE_THRESHOLD = 0.85;
export const JEV_NONE = '__none__';
export const jevChoiceRequestSchema = z.strictObject({
  state: z.string().min(1).max(40_000),
  instructions: z.string().min(1).max(2_000),
  options: z.record(z.string().min(1).max(200), z.string().min(1).max(2_000))
    .refine((value) => Object.keys(value).length >= 2 && Object.keys(value).length <= 255),
});
export type JevChoiceRequest = z.infer<typeof jevChoiceRequestSchema>;
export const jevChoiceResultSchema = z.strictObject({
  choice: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  inputTokens: z.number().int().nonnegative(),
  model: z.literal(JEV_MODEL),
});
export type JevChoiceResult = z.infer<typeof jevChoiceResultSchema>;
export type JevChoiceClient = (request: JevChoiceRequest, signal: AbortSignal) => Promise<JevChoiceResult>;
