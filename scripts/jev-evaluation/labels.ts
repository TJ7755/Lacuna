import { createHash } from 'node:crypto';
import { z } from 'zod';
import { JEV_DIAGNOSTIC_OUTCOMES } from '@lacuna/core/jev/diagnosis';
import { cases } from './pack';

export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const text = z.string().trim().min(1);
const labelSchema = z.strictObject({
  id: text,
  mark: z.number().int().nonnegative(),
  knowledge: z.enum(JEV_DIAGNOSTIC_OUTCOMES),
  application: z.enum(JEV_DIAGNOSTIC_OUTCOMES),
  'causal-link': z.enum(JEV_DIAGNOSTIC_OUTCOMES),
  rationale: text,
});
export type Label = z.infer<typeof labelSchema>;
const reviewSchema = z.strictObject({
  identity: text,
  reviewerId: text,
  reviewReference: text,
  source: z.enum(['agent', 'human']),
  independent: z.literal(true),
  contentApproved: z.literal(true),
  completedAt: z.iso.datetime(),
  labels: z.array(labelSchema),
});

/** Validate the recorded review; provenance and independence are retained for review. */
export function validateLabels(bundle: unknown, identity: string, evaluationCases = cases) {
  const parsed = z
    .strictObject({
      reviews: z.array(reviewSchema).min(1).max(2),
      adjudication: reviewSchema.optional(),
    })
    .parse(bundle);
  for (const review of [...parsed.reviews, ...(parsed.adjudication ? [parsed.adjudication] : [])]) {
    if (review.identity !== identity || Date.parse(review.completedAt) > Date.now())
      throw new Error('Reference labels must match the frozen packet and a completed review.');
    if (new Set(review.labels.map((row) => row.id)).size !== review.labels.length)
      throw new Error('Duplicate reference labels.');
    for (const label of review.labels) {
      const item = evaluationCases.find((item) => item.id === label.id);
      if (!item || label.mark > item.request.maxMarks)
        throw new Error('Unknown case or out-of-range reference mark.');
      if (
        (!item.request.answer.trim() || !item.request.diagnostic) &&
        [label.knowledge, label.application, label['causal-link']].some(
          (value) => value !== 'insufficient-evidence',
        )
      )
        throw new Error(
          'Blank answers and marking-only cases require insufficient diagnostic evidence.',
        );
    }
  }
  const { reviews, adjudication } = parsed;
  if (
    new Set(reviews.map((review) => review.reviewerId)).size !== reviews.length ||
    reviews.some((row) => row.labels.length !== evaluationCases.length)
  )
    throw new Error('Complete independent reference reviews are required.');
  if (adjudication && reviews.some((review) => review.reviewerId === adjudication.reviewerId))
    throw new Error('Adjudication requires a separate independent reviewer.');
  const dimensions = ['mark', 'knowledge', 'application', 'causal-link'] as const;
  const disagreements = evaluationCases
    .filter(({ id }) =>
      dimensions.some((key) =>
        reviews
          .slice(1)
          .some(
            (review) =>
              reviews[0].labels.find((row) => row.id === id)![key] !==
              review.labels.find((row) => row.id === id)![key],
          ),
      ),
    )
    .map(({ id }) => id);
  if (
    (adjudication?.labels.length ?? 0) !== disagreements.length ||
    disagreements.some((id) => !adjudication?.labels.some((row) => row.id === id))
  )
    throw new Error('Every disagreement requires independent adjudication.');
  const gold = evaluationCases.map(
    ({ id }) =>
      adjudication?.labels.find((row) => row.id === id) ??
      reviews[0].labels.find((row) => row.id === id)!,
  );
  return { gold, reviews, disagreements, adjudication };
}
