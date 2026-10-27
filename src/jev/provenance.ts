import { z } from 'zod';
import { jevDiagnosisSchema } from './diagnosis';

/** Additive evidence: old records remain valid without this field. */
export const jevMarkProvenanceSchema = z.strictObject({
  by: z.literal('jev'),
  model: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1),
  markedAt: z.number().int().nonnegative(),
});

export const jevAssessmentReceiptSchema = z.strictObject({
  allocationId: z.string().min(1),
  mark: z.number().int().min(0).max(9).nullable(),
  marking: jevMarkProvenanceSchema,
  diagnosis: jevDiagnosisSchema,
});

export type JevAssessmentReceipt = z.infer<typeof jevAssessmentReceiptSchema>;
