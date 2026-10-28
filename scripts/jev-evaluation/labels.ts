import { createHash, createPublicKey, verify } from 'node:crypto';
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
const signedSchema = z.strictObject({ payload: z.string().min(1), signature: text });
const bodySchema = z.strictObject({
  identity: text,
  reviewerId: text,
  source: z.literal('human'),
  independent: z.literal(true),
  contentApproved: z.literal(true),
  completedAt: z.iso.datetime(),
  labels: z.array(labelSchema),
});
const authoritySchema = z.strictObject({
  authorisationReference: text,
  reviewers: z
    .array(
      z.strictObject({
        id: text,
        publicKey: text,
        role: z.enum(['reviewer', 'adjudicator']),
        human: z.literal(true),
        independentOfAuthoringAndProvider: z.literal(true),
      }),
    )
    .min(2),
});

export function validateLabels(
  bundle: unknown,
  authorityText: string,
  trustedHash: string,
  identity: string,
) {
  if (!/^[a-f0-9]{64}$/.test(trustedHash) || hash(authorityText) !== trustedHash)
    throw new Error(
      'Human authority hash does not match the independently approved trust document.',
    );
  const authority = authoritySchema.parse(JSON.parse(authorityText));
  const keys = authority.reviewers.map((row) => createPublicKey(row.publicKey));
  if (
    keys.some((key) => key.asymmetricKeyType !== 'ed25519') ||
    new Set(keys.map((key) => key.export({ type: 'spki', format: 'der' }).toString('hex'))).size !==
      keys.length ||
    new Set(authority.reviewers.map((row) => row.id)).size !== keys.length
  )
    throw new Error('Human authorities require distinct Ed25519 keys and identities.');
  const parsed = z
    .strictObject({
      reviews: z.array(signedSchema).length(2),
      adjudication: signedSchema.optional(),
    })
    .parse(bundle);
  const read = (signed: z.infer<typeof signedSchema>, role: 'reviewer' | 'adjudicator') => {
    const body = bodySchema.parse(JSON.parse(signed.payload));
    const index = authority.reviewers.findIndex(
      (row) => row.id === body.reviewerId && row.role === role,
    );
    if (
      index < 0 ||
      body.identity !== identity ||
      Date.parse(body.completedAt) > Date.now() ||
      !verify(
        null,
        Buffer.from(signed.payload),
        keys[index],
        Buffer.from(signed.signature, 'base64'),
      )
    )
      throw new Error('Unauthorised, stale or invalid human label signature.');
    if (new Set(body.labels.map((row) => row.id)).size !== body.labels.length)
      throw new Error('Duplicate human labels.');
    for (const label of body.labels) {
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
    return body;
  };
  const reviews = parsed.reviews.map((row) => read(row, 'reviewer'));
  if (
    reviews[0].reviewerId === reviews[1].reviewerId ||
    reviews.some((row) => row.labels.length !== cases.length)
  )
    throw new Error('Two complete independent human reviews are required.');
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
  const adjudication = parsed.adjudication ? read(parsed.adjudication, 'adjudicator') : undefined;
  if (
    (adjudication?.labels.length ?? 0) !== disagreements.length ||
    disagreements.some((id) => !adjudication?.labels.some((row) => row.id === id))
  )
    throw new Error('Every disagreement requires a separately authorised human adjudication.');
  const gold = cases.map(
    ({ id }) =>
      adjudication?.labels.find((row) => row.id === id) ??
      reviews[0].labels.find((row) => row.id === id)!,
  );
  return { gold, reviews, disagreements, adjudication, signedRecords: parsed, authority };
}
