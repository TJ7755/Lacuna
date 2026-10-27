import { z } from 'zod';

export const JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD = 0.85;
export const JEV_DIAGNOSTIC_OUTCOMES = ['gap', 'no-gap', 'insufficient-evidence'] as const;
export const JEV_DIAGNOSTIC_CATEGORIES = ['knowledge', 'application', 'causal-link'] as const;

export const jevDiagnosticRequestSchema = z.strictObject({
  taxonomyId: z.literal('science-explanations'),
  taxonomyVersion: z.literal(1),
  techniqueIds: z.array(z.literal('causal-link')).length(1),
});

export const jevDiagnosisSchema = z.strictObject({
  taxonomyId: z.literal('science-explanations'),
  taxonomyVersion: z.literal(1),
  decisions: z
    .array(
      z.strictObject({
        categoryId: z.enum(JEV_DIAGNOSTIC_CATEGORIES),
        outcome: z.enum(JEV_DIAGNOSTIC_OUTCOMES),
        confidence: z.number().min(0).max(1),
      }),
    )
    .length(JEV_DIAGNOSTIC_CATEGORIES.length)
    .refine((rows) => new Set(rows.map((row) => row.categoryId)).size === rows.length),
});

export type JevDiagnosis = z.infer<typeof jevDiagnosisSchema>;

/** Confidence in a mark never establishes confidence in the cause of a lost mark. */
export function checkedDiagnosis(diagnosis: JevDiagnosis, answer: string): JevDiagnosis {
  return {
    ...diagnosis,
    decisions: diagnosis.decisions.map((row) => ({
      ...row,
      outcome:
        !answer.trim() || row.confidence < JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD
          ? 'insufficient-evidence'
          : row.outcome,
    })),
  };
}
