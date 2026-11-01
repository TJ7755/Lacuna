import { z } from 'zod';
import { getShareBytes, putShareBytes } from '../shareLinks/client';
import { insightsRecipientSchema, type InsightsRecipient } from './recipient';
import { validateInsightsRecipient } from './envelope';
import type { ClassInvitation } from './classCode';

const publicationSchema = z
  .object({
    v: z.literal(1),
    shareId: z.string().regex(/^[0-9a-f]{32}$/),
    recipient: insightsRecipientSchema,
  })
  .strict();
interface ClassKeyOptions {
  shareId: string;
  relayUrl: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function parsePublication(bytes: Uint8Array, shareId: string) {
  const publication = publicationSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
  if (publication.shareId !== shareId)
    throw new Error('The published teacher key belongs to another class.');
  return publication;
}

export async function getClassRecipient(
  options: ClassKeyOptions & Pick<ClassInvitation, 'keyId'>,
): Promise<InsightsRecipient> {
  const recipient = await getPublishedClassRecipient(options);
  if (recipient.keyId !== options.keyId)
    throw new Error(
      'The teacher key does not match the class code. Ask your teacher for a fresh code.',
    );
  return recipient;
}

/** Short-code joins trust the relay for the teacher key rather than pinning a fingerprint. */
export async function getPublishedClassRecipient(
  options: ClassKeyOptions,
): Promise<InsightsRecipient> {
  return timed(options, async (signal) => {
    const stored = await getShareBytes({ ...options, signal, slot: 'teacher' });
    if (!stored) throw new Error('This class does not have a published teacher key.');
    const { recipient } = parsePublication(stored.bytes, options.shareId);
    return validateInsightsRecipient(recipient);
  });
}

/** Publishing never replaces a different key. Rotation needs a separate explicit workflow. */
export async function publishClassRecipient(
  options: ClassKeyOptions & { writeToken: string; recipient: InsightsRecipient },
): Promise<void> {
  const recipient = await validateInsightsRecipient(options.recipient);
  await timed(options, async (signal) => {
    const stored = await getShareBytes({ ...options, signal, slot: 'teacher' });
    if (stored) {
      const existing = parsePublication(stored.bytes, options.shareId);
      if (
        existing.recipient.keyId !== recipient.keyId ||
        existing.recipient.publicKey !== recipient.publicKey
      )
        throw new Error(
          'This class already has a different teacher key. Restore its original key.',
        );
    }
    await putShareBytes({
      ...options,
      signal,
      slot: 'teacher',
      bytes: new TextEncoder().encode(
        JSON.stringify({ v: 1, shareId: options.shareId, recipient }),
      ),
      ifMatch: stored?.generation ?? '"0"',
    });
  });
}

async function timed<T>(
  options: ClassKeyOptions,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
