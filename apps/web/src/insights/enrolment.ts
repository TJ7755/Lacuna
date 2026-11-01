import { storedString } from '../state/localSetting';
import { z } from 'zod';
import { enrolmentStorageOptions } from './enrolmentStorage';
import { createLocalSetting, parseJson } from '../state/localSetting';
import {
  createInsightsOptInSetting,
  createInsightsLastSentDaySetting,
  createInsightsLastPublishedAtSetting,
} from '../state/insightsOptIn';
import { insightsRecipientSchema, type InsightsRecipient } from './recipient';
import { createInsightsOutbox } from './outbox';

const enrolmentSchema = z
  .object({
    v: z.literal(1),
    shareId: z.string().regex(/^[0-9a-f]{32}$/),
    lineageId: z.string().min(1).max(200),
    recipient: insightsRecipientSchema,
    pupilId: z.string().regex(/^[0-9a-f]{32}$/),
    pupilLabel: z.string().max(80),
    consentedAt: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type ClassEnrolment = z.infer<typeof enrolmentSchema>;
export const reportingEnabled = () => import.meta.env.VITE_GAPS_REPORTING_ENABLED === 'true';

/** Deliberately device-local: importing a backup must never grant reporting consent. */
export function createEnrolmentSetting(courseId: string) {
  return createLocalSetting<ClassEnrolment | null>({
    ...enrolmentStorageOptions(courseId),
    parse: (raw) =>
      parseJson(
        raw,
        () => null,
        (value) => enrolmentSchema.parse(value),
      ),
    serialise: JSON.stringify,
  });
}

/** Call only after checking the invitation fingerprint and imported course lineage. */
export function enrolInClass(
  courseId: string,
  invitation: {
    shareId: string;
    lineageId: string;
    recipient: InsightsRecipient;
  },
): void {
  const setting = createEnrolmentSetting(courseId),
    existing = setting.read();
  if (existing) {
    if (
      existing.shareId !== invitation.shareId ||
      existing.lineageId !== invitation.lineageId ||
      existing.recipient.keyId !== invitation.recipient.keyId ||
      existing.recipient.publicKey !== invitation.recipient.publicKey
    )
      throw new Error(
        'This course is already joined to a different teacher. Restore the original class code.',
      );
    return;
  }
  const next = enrolmentSchema.parse({
    v: 1,
    ...invitation,
    pupilId: crypto.randomUUID().replaceAll('-', ''),
    pupilLabel: '',
    consentedAt: null,
  });
  createInsightsOptInSetting(courseId).write(false);
  setting.write(next);
}

export function setReportingConsent(courseId: string, enabled: boolean, label = ''): void {
  const setting = createEnrolmentSetting(courseId),
    saved = setting.read();
  const optIn = createInsightsOptInSetting(courseId);
  if (!enabled) {
    optIn.write(false);
    if (saved) setting.write({ ...saved, consentedAt: null });
    return;
  }
  if (!saved) throw new Error('Join using your teacher’s class code first.');
  const pupilLabel = label.trim();
  if (!pupilLabel || pupilLabel.length > 80)
    throw new Error('Enter a name or class identifier (up to 80 characters).');
  // Store the disclosure-specific consent first. Either failed write leaves sending off.
  optIn.write(false);
  setting.write({ ...saved, pupilLabel, consentedAt: Date.now() });
  optIn.write(true);
}

export async function disconnectFromClass(courseId: string): Promise<void> {
  const setting = createEnrolmentSetting(courseId);
  const enrolment = setting.read();
  // Revoke consent first so an interrupted disconnect still leaves reporting off.
  setReportingConsent(courseId, false);
  if (enrolment) {
    const outbox = createInsightsOutbox();
    try {
      await outbox.discard(enrolment.shareId);
    } finally {
      outbox.close();
    }
  }
  createInsightsLastSentDaySetting(courseId).write(null);
  createInsightsLastPublishedAtSetting(courseId).write(null);
  storedString(`lacuna.insights.attempt.${courseId}`).remove();
  setting.write(null);
}
