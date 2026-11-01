import { z } from 'zod';
import { DAY_MS, isoDayStartMs } from '../../../relay/shared/insights/index';
import { INSIGHT_MAX_EVIDENCE_BYTES } from '../../../relay/shared/insights/index';

const identity = z.string().min(1).max(200);
const marks = z.number().finite().min(0).max(1_000_000);
const criterion = z
  .object({ id: identity, label: z.string().max(500), earned: marks.nullable(), available: marks })
  .strict()
  .refine((row) => row.earned === null || row.earned <= row.available);
const eventSchema = z
  .object({
    id: identity,
    kind: z.enum(['card', 'question', 'question-set']),
    at: z.number().int().nonnegative(),
    itemId: identity,
    prompt: z.string().max(2000),
    answer: z.string().max(4000),
    conceptIds: z.array(identity).max(32),
    earned: marks.nullable(),
    available: marks.nullable(),
    retained: z.boolean().nullable(),
    criteria: z.array(criterion).max(32),
    marking: z.enum(['recall', 'automatic', 'self']),
    disputed: z.boolean(),
    shortened: z.boolean(),
  })
  .strict()
  .refine((row) => row.earned === null || (row.available !== null && row.earned <= row.available));
const evidenceSchema = z
  .object({
    v: z.literal(1),
    shareId: z.string().regex(/^[0-9a-f]{32}$/),
    day: z.string(),
    pupil: z
      .object({ id: z.string().regex(/^[0-9a-f]{32}$/), label: z.string().trim().min(1).max(80) })
      .strict(),
    events: z.array(eventSchema).max(200),
    omitted: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((report, ctx) => {
    const start = isoDayStartMs(report.day);
    const ids = new Set<string>();
    for (const event of report.events) {
      if (event.at < start || event.at >= start + DAY_MS || ids.has(event.id))
        ctx.addIssue({ code: 'custom', message: 'Invalid evidence day or duplicate event.' });
      ids.add(event.id);
    }
  });
export type DailyEvidenceEvent = z.infer<typeof eventSchema>;
export type DailyEvidence = z.infer<typeof evidenceSchema>;
export class DailyEvidenceTooLargeError extends Error {
  constructor() {
    super('The daily report exceeds 64 KiB.');
  }
}

export function encodeDailyEvidence(report: Omit<DailyEvidence, 'v'>): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(evidenceSchema.parse({ ...report, v: 1 })));
  if (bytes.byteLength > INSIGHT_MAX_EVIDENCE_BYTES) throw new DailyEvidenceTooLargeError();
  return bytes;
}

export function parseDailyEvidence(
  bytes: Uint8Array,
  context: Pick<DailyEvidence, 'shareId' | 'day'>,
): DailyEvidence {
  if (bytes.byteLength > INSIGHT_MAX_EVIDENCE_BYTES) throw new DailyEvidenceTooLargeError();
  const report = evidenceSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
  if (report.shareId !== context.shareId || report.day !== context.day)
    throw new Error('The report belongs to another course or day.');
  return report;
}
