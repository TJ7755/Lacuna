import { z } from 'zod';

/** Additive evidence: old records remain valid without this field. */
export const jevMarkProvenanceSchema = z.strictObject({
  by: z.literal('jev'),
  model: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1),
  markedAt: z.number().int().nonnegative(),
});
