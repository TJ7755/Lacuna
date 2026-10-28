import { createHash } from 'node:crypto';
import { z } from 'zod';
import { JEV_DIAGNOSTIC_OUTCOMES } from '../../src/jev/diagnosis';
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
  approvalReference: text,
  source: z.literal('human'),
  independent: z.literal(true),
  contentApproved: z.literal(true),
  completedAt: z.iso.datetime(),
  labels: z.array(labelSchema),
});

/** Validate the recorded review; verifying the people and approval is an operator responsibility. */
export function validateLabels(bundle: unknown, identity: string) {
  const parsed = z
    .strictObject({
      reviews: z.array(reviewSchema).length(2),
      adjudication: reviewSchema.optional(),
    })
    .parse(bundle);
  for (const review of [...parsed.reviews, ...(parsed.adjudication ? [parsed.adjudication] : [])]) {
    if (review.identity !== identity || Date.parse(review.completedAt) > Date.now())
      throw new Error('Human labels must match the frozen packet and a completed review.');
    if (new Set(review.labels.map((row) => row.id)).size !== review.labels.length)
      throw new Error('Duplicate human labels.');
    for (const label of review.labels) {
      const item = cases.find((item) => item.id === label.id);
      if (!item || label.mark > item.request.maxMarks)
        throw new Error('Unknown case or out-of-range human mark.');
      if (
        !item.request.answer.trim() &&
        [label.knowledge, label.application, label['causal-link']].some(
          (value) => value !== 'insufficient-evidence',
        )
      )
        throw new Error('Blank answers cannot establish diagnostic gaps.');
    }
  }
  const { reviews, adjudication } = parsed;
  if (
    reviews[0].reviewerId === reviews[1].reviewerId ||
    reviews.some((row) => row.labels.length !== cases.length)
  )
    throw new Error('Two complete independent human reviews are required.');
  if (adjudication && reviews.some((review) => review.reviewerId === adjudication.reviewerId))
    throw new Error('Adjudication requires a separate independent human reviewer.');
  const dimensions = ['mark', 'knowledge', 'application', 'causal-link'] as const;
  const disagreements = cases
    .filter(({ id }) =>
      dimensions.some(
        (key) =>
          reviews[0].labels.find((row) => row.id === id)![key] !==
          reviews[1].labels.find((row) => row.id === id)![key],
      ),
    )
    .map(({ id }) => id);
  if (
    (adjudication?.labels.length ?? 0) !== disagreements.length ||
    disagreements.some((id) => !adjudication?.labels.some((row) => row.id === id))
  )
    throw new Error('Every disagreement requires independent human adjudication.');
  const gold = cases.map(
    ({ id }) =>
      adjudication?.labels.find((row) => row.id === id) ??
      reviews[0].labels.find((row) => row.id === id)!,
  );
  return { gold, reviews, disagreements, adjudication };
}
