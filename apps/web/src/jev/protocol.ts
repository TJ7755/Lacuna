import { z } from 'zod';
import { jevDiagnosticRequestSchema, jevDiagnosisSchema } from '@lacuna/core/jev/diagnosis';
import {
  COURSE_TECHNIQUE_LIMIT,
  courseTechniqueIdSchema,
  TECHNIQUE_NAME_MAX,
  TECHNIQUE_TEXT_MAX,
} from '@lacuna/core/questions/techniqueTags';

export const JEV_MODEL = 'jev-1.14.0';
export const JEV_TYPED_CORRECT_THRESHOLD = 0.75;
export const JEV_TYPED_INCORRECT_THRESHOLD = 0.75;
export const JEV_ALLOCATION_CONFIDENCE_THRESHOLDS = {
  singleMark: 0.55,
  twoMarks: 0.55,
  other: 0.85,
} as const;
export function jevAllocationConfidenceThreshold(maxMarks: number): number {
  return maxMarks === 1
    ? JEV_ALLOCATION_CONFIDENCE_THRESHOLDS.singleMark
    : maxMarks === 2
      ? JEV_ALLOCATION_CONFIDENCE_THRESHOLDS.twoMarks
      : JEV_ALLOCATION_CONFIDENCE_THRESHOLDS.other;
}
export const JEV_ALLOCATION_PROMPT_VERSION = 5;
export const JEV_DIAGNOSTIC_PROMPT_VERSION = 1;
export const JEV_TYPED_KIND_CONFIDENCE_THRESHOLD = 0.7;
export const JEV_TYPED_PART_COVERED_THRESHOLD = 0.8;
export const JEV_TYPED_PART_NOT_COVERED_THRESHOLD = 0.2;
// Bump when feedback instructions or the shared splitter change.
export const JEV_TYPED_FEEDBACK_VERSION = 1;
export const JEV_TYPED_MAX_PARTS = 8;
export const JEV_ANSWER_KINDS = [
  'same',
  'spelling',
  'imprecise',
  'partial',
  'wrong',
  'blank',
] as const;
export const jevTypedFeedbackSchema = z.strictObject({
  kind: z.enum(JEV_ANSWER_KINDS).nullable(),
  parts: z
    .array(
      z
        .strictObject({
          start: z.number().int().nonnegative(),
          end: z.number().int().positive(),
          covered: z.boolean().nullable(),
        })
        .refine((part) => part.end > part.start),
    )
    .max(JEV_TYPED_MAX_PARTS),
});
/** The longest free text one request field may carry. */
export const JEV_TEXT_MAX = 12_000;
const text = z.string().max(JEV_TEXT_MAX);
// Only these purposes are executable; future purposes require a new validated branch.
export const jevDecisionRequestSchema = z.discriminatedUnion('purpose', [
  z.strictObject({
    purpose: z.literal('typed-equivalence'),
    prompt: text.min(1),
    expected: text.min(1),
    answer: text,
    requireCorrectSpelling: z.literal(true).optional(),
  }),
  z.strictObject({
    purpose: z.literal('mark-allocation'),
    prompt: text.min(1),
    criterion: text.min(1),
    explanation: text,
    maxMarks: z.number().int().min(1).max(9),
    answer: text,
    diagnostic: jevDiagnosticRequestSchema.optional(),
  }),
]);
export type JevDecisionRequest = z.infer<typeof jevDecisionRequestSchema>;
export const jevDecisionResultSchema = z.strictObject({
  value: z.number().int().min(0).max(9).nullable(),
  confidence: z.number().min(0).max(1),
  inputTokens: z.number().int().nonnegative(),
  model: z.literal(JEV_MODEL),
  feedback: jevTypedFeedbackSchema.optional(),
  diagnosis: jevDiagnosisSchema.optional(),
});
export type JevDecisionResult = z.infer<typeof jevDecisionResultSchema>;
export type JevDecisionClient = (
  request: JevDecisionRequest,
  signal: AbortSignal,
) => Promise<JevDecisionResult>;

export const jevAllocationInputSchema = jevDecisionRequestSchema.options[1].omit({ purpose: true });
export type JevAllocationInput = z.infer<typeof jevAllocationInputSchema>;
export const JEV_BATCH_MAX_ALLOCATIONS = 128;
export const JEV_BATCH_REQUEST_BYTE_LIMIT = 90_000;
export const jevAllocationBatchRequestSchema = z.strictObject({
  purpose: z.literal('mark-allocation'),
  allocations: z.array(jevAllocationInputSchema).min(1).max(JEV_BATCH_MAX_ALLOCATIONS),
});
export type JevAllocationBatchRequest = z.infer<typeof jevAllocationBatchRequestSchema>;

/**
 * Technique classification asks, for every marking point and catalogue technique, whether
 * earning the point requires the technique. At or above the active threshold the tag counts at
 * once; between the thresholds it is suggested for the author to confirm; below, it is omitted.
 */
export const JEV_CLASSIFY_PROMPT_VERSION = 1;
export const JEV_CLASSIFY_ACTIVE_THRESHOLD = 0.8;
export const JEV_CLASSIFY_SUGGEST_THRESHOLD = 0.4;
/** Points × techniques per request, so one request stays one bounded provider call. */
export const JEV_CLASSIFY_MAX_QUESTIONS = 192;
export const JEV_CLASSIFY_MAX_POINTS = 64;
export const jevClassifyTechniqueSchema = z.strictObject({
  id: courseTechniqueIdSchema,
  name: z.string().trim().min(1).max(TECHNIQUE_NAME_MAX),
  description: z.string().trim().min(1).max(TECHNIQUE_TEXT_MAX).optional(),
  example: z.string().trim().min(1).max(TECHNIQUE_TEXT_MAX).optional(),
});
export const jevClassifyPointSchema = z.strictObject({
  prompt: text.min(1),
  criterion: text.min(1),
  explanation: text,
  maxMarks: z.number().int().positive().max(10_000),
});
export type JevClassifyPoint = z.infer<typeof jevClassifyPointSchema>;
export const jevTechniqueClassificationRequestSchema = z
  .strictObject({
    purpose: z.literal('technique-classification'),
    techniques: z.array(jevClassifyTechniqueSchema).min(1).max(COURSE_TECHNIQUE_LIMIT),
    points: z.array(jevClassifyPointSchema).min(1).max(JEV_CLASSIFY_MAX_POINTS),
  })
  .refine(
    (request) =>
      new Set(request.techniques.map((technique) => technique.id)).size ===
        request.techniques.length &&
      request.techniques.length * request.points.length <= JEV_CLASSIFY_MAX_QUESTIONS,
    'Duplicate techniques or too many classification questions.',
  );
export type JevTechniqueClassificationRequest = z.infer<
  typeof jevTechniqueClassificationRequestSchema
>;
export const jevTechniqueClassificationResultSchema = z.strictObject({
  model: z.literal(JEV_MODEL),
  inputTokens: z.number().int().nonnegative(),
  points: z
    .array(
      z.strictObject({
        techniqueIds: z.array(courseTechniqueIdSchema).max(COURSE_TECHNIQUE_LIMIT),
        suggestedIds: z.array(courseTechniqueIdSchema).max(COURSE_TECHNIQUE_LIMIT),
      }),
    )
    .max(JEV_CLASSIFY_MAX_POINTS),
});
export type JevTechniqueClassificationResult = z.infer<
  typeof jevTechniqueClassificationResultSchema
>;

// Bump when the Choice question, batching or shortlist policy changes.
export const JEV_DISTRACTOR_POLICY_VERSION = 1;
export const JEV_DISTRACTOR_MAX_BANK = 48;
export const JEV_DISTRACTOR_SINGLE_BATCH = 32;
export const JEV_DISTRACTOR_BATCH_TARGETS = 16;
export const JEV_DISTRACTOR_MAX_BYTES = 12_000;
export const JEV_DISTRACTOR_MAX_PROMPT = 500;
export const JEV_DISTRACTOR_MAX_ANSWER = 160;
const JEV_DISTRACTOR_MIN_RANKED = 3;
const JEV_DISTRACTOR_MAX_RANKED = 8;
const distractorCard = z.strictObject({
  prompt: z.string().trim().min(1).max(JEV_DISTRACTOR_MAX_PROMPT).optional(),
  answer: z.string().trim().min(1).max(JEV_DISTRACTOR_MAX_ANSWER),
});
export const jevLessonDistractorRequestSchema = z
  .strictObject({
    purpose: z.literal('lesson-distractors'),
    cards: z.array(distractorCard).min(3).max(JEV_DISTRACTOR_MAX_BANK),
    targets: z
      .array(z.number().int().nonnegative())
      .min(1)
      .max(JEV_DISTRACTOR_BATCH_TARGETS)
      .optional(),
  })
  .refine(({ cards, targets }) => {
    if (new TextEncoder().encode(JSON.stringify(cards)).length > JEV_DISTRACTOR_MAX_BYTES)
      return false;
    if (!targets)
      return cards.length <= JEV_DISTRACTOR_SINGLE_BATCH && cards.every((card) => card.prompt);
    return (
      targets.length === new Set(targets).size && targets.every((target) => cards[target]?.prompt)
    );
  }, 'Lesson distractor content or targets exceed their bounds.');
export type JevLessonDistractorRequest = z.infer<typeof jevLessonDistractorRequestSchema>;
export const jevLessonDistractorResultSchema = z.strictObject({
  model: z.literal(JEV_MODEL),
  inputTokens: z.number().int().nonnegative(),
  rankings: z
    .array(
      z
        .array(
          z
            .number()
            .int()
            .nonnegative()
            .max(JEV_DISTRACTOR_MAX_BANK - 1),
        )
        .max(JEV_DISTRACTOR_MAX_RANKED),
    )
    .max(JEV_DISTRACTOR_SINGLE_BATCH),
});
export type JevLessonDistractorResult = z.infer<typeof jevLessonDistractorResultSchema>;

export function lessonDistractorTargets(request: JevLessonDistractorRequest): number[] {
  return request.targets ?? request.cards.map((_card, index) => index);
}

/** Keep punctuation variants such as US and U.S. out of the same answer set. */
export function lessonDistractorAnswerKey(answer: string): string {
  const text = answer.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/’/g, "'").toLowerCase();
  const key = text.replace(/[.!?]+$/, '') || text;
  return /^(?:\p{L}\.)+\p{L}$/u.test(key) ? key.replace(/\./g, '') : key;
}

export function lessonDistractorCandidates(
  cards: JevLessonDistractorRequest['cards'],
  target: number,
): number[] {
  const seen = new Set([lessonDistractorAnswerKey(cards[target].answer)]);
  return cards.flatMap(({ answer }, index) => {
    const candidate = lessonDistractorAnswerKey(answer);
    if (seen.has(candidate)) return [];
    seen.add(candidate);
    return [index];
  });
}

export function shortlistJevDistractors(
  scored: { index: number; probability: number }[],
): number[] {
  const ranked = scored.toSorted((a, b) => b.probability - a.probability || a.index - b.index);
  const third = ranked[JEV_DISTRACTOR_MIN_RANKED - 1]?.probability ?? 0;
  const threshold = Math.max(0.02, 0.6 * third);
  return ranked
    .slice(0, JEV_DISTRACTOR_MAX_RANKED)
    .filter(({ probability }, rank) => rank < JEV_DISTRACTOR_MIN_RANKED || probability >= threshold)
    .map(({ index }) => index);
}

export function validLessonDistractorRankings(
  request: JevLessonDistractorRequest,
  result: JevLessonDistractorResult,
): boolean {
  const targets = lessonDistractorTargets(request);
  return (
    result.rankings.length === targets.length &&
    result.rankings.every((row, index) => {
      const candidates = lessonDistractorCandidates(request.cards, targets[index]);
      return (
        row.length >= Math.min(JEV_DISTRACTOR_MIN_RANKED, candidates.length) &&
        row.length === new Set(row).size &&
        row.every((candidate) => candidates.includes(candidate))
      );
    })
  );
}

export const jevMarkRequestSchema = z.union([
  jevDecisionRequestSchema,
  jevAllocationBatchRequestSchema,
  jevTechniqueClassificationRequestSchema,
  jevLessonDistractorRequestSchema,
]);
export const jevAllocationBatchResultSchema = z.strictObject({
  model: z.literal(JEV_MODEL),
  inputTokens: z.number().int().nonnegative(),
  decisions: z
    .array(jevDecisionResultSchema.omit({ inputTokens: true }))
    .max(JEV_BATCH_MAX_ALLOCATIONS),
});
export type JevAllocationBatchResult = z.infer<typeof jevAllocationBatchResultSchema>;
