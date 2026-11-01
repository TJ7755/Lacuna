import { z } from 'zod';
import {
  SCIENCE_TECHNIQUES,
  techniqueIdSchema,
  validTechniqueSelection,
} from '@lacuna/core/questions/techniqueTags';

export const JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD = 0.85;
export const JEV_DIAGNOSTIC_OUTCOMES = ['gap', 'no-gap', 'insufficient-evidence'] as const;
export const JEV_DIAGNOSTIC_CATEGORIES = ['knowledge', 'application', 'causal-link'] as const;

export const jevDiagnosticRequestSchema = z
  .strictObject({
    taxonomyId: z.enum(['science-explanations', 'science-techniques']),
    taxonomyVersion: z.literal(1),
    techniqueIds: z.array(techniqueIdSchema).min(1).max(SCIENCE_TECHNIQUES.length),
  })
  .refine(validTechniqueSelection, 'Unsupported or duplicate diagnostic techniques.');
export type JevDiagnosticRequest = z.infer<typeof jevDiagnosticRequestSchema>;

export function diagnosticCategories(request: JevDiagnosticRequest) {
  return ['knowledge', 'application', ...request.techniqueIds] as const;
}

export const jevDiagnosisSchema = z
  .strictObject({
    taxonomyId: z.enum(['science-explanations', 'science-techniques']),
    taxonomyVersion: z.literal(1),
    decisions: z
      .array(
        z.strictObject({
          categoryId: z.enum([
            'knowledge',
            'application',
            ...SCIENCE_TECHNIQUES.map((skill) => skill.id),
          ]),
          outcome: z.enum(JEV_DIAGNOSTIC_OUTCOMES),
          confidence: z.number().min(0).max(1),
        }),
      )
      .min(3)
      .max(SCIENCE_TECHNIQUES.length + 2)
      .refine(
        (rows) =>
          new Set(rows.map((row) => row.categoryId)).size === rows.length &&
          rows.some((row) => row.categoryId === 'knowledge') &&
          rows.some((row) => row.categoryId === 'application'),
      ),
  })
  .refine(
    (diagnosis) =>
      diagnosis.taxonomyId === 'science-techniques' ||
      (diagnosis.decisions.length === JEV_DIAGNOSTIC_CATEGORIES.length &&
        diagnosis.decisions.every((row) =>
          JEV_DIAGNOSTIC_CATEGORIES.some((id) => id === row.categoryId),
        )),
  );

export type JevDiagnosis = z.infer<typeof jevDiagnosisSchema>;

export function diagnosisMatchesRequest(
  diagnosis: JevDiagnosis,
  request: JevDiagnosticRequest,
): boolean {
  const categories = diagnosticCategories(request);
  return (
    diagnosis.taxonomyId === request.taxonomyId &&
    diagnosis.taxonomyVersion === request.taxonomyVersion &&
    diagnosis.decisions.length === categories.length &&
    diagnosis.decisions.every((row) => categories.some((id) => id === row.categoryId))
  );
}

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
