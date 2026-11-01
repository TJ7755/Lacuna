import { z } from 'zod';
import {
  MAX_AI_ACTIVITY_LENGTH,
  MAX_AI_IDENTIFIER_LENGTH,
  MAX_AI_MESSAGE_LENGTH,
  aiActionReceiptSchema,
  aiBridgeErrorSchema,
  aiClientIdentitySchema,
  aiInstructionBundleSchema,
  aiToolNameSchema,
  boundedJsonValueSchema,
  jsonValueSchema,
} from './protocol';

/** Stable encrypted envelope format. Mailbox records may evolve independently. */
export const AI_RELAY_ENVELOPE_VERSION = 1 as const;
export const AI_RELAY_PROTOCOL_VERSION = 3 as const;
export const AI_RELAY_EMPTY_GENERATION = '"0"';
export const MAX_AI_RELAY_MAILBOX_ENTRIES = 2_000;

const base64UrlSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/, 'Expected unpadded base64url.');

function decodedLength(value: string): number | null {
  try {
    const padded =
      value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
    return atob(padded).length;
  } catch {
    return null;
  }
}

export const relayPublicKeySchema = base64UrlSchema.refine(
  (value) => decodedLength(value) === 65,
  'Expected a raw 65-byte P-256 public key.',
);

export const relaySessionIdSchema = z.string().regex(/^[A-HJ-KM-NP-TV-Z2-9]{20}$/);
export const relayPairingCodeSchema = z
  .string()
  .regex(/^[A-HJ-KM-NP-TV-Z2-9]{4}(?:-[A-HJ-KM-NP-TV-Z2-9]{4}){4}$/);
export const relayTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const relayTimestampSchema = z.number().int().nonnegative().finite();
const relayRevisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const relayGenerationSchema = z
  .string()
  .regex(/^"[^"\r\n]+"$/, 'Expected a quoted mailbox generation.');
const relayIdentifierSchema = z
  .string()
  .min(1)
  .max(MAX_AI_IDENTIFIER_LENGTH)
  .refine((value) => value.trim() === value, 'Identifiers must not have surrounding whitespace.')
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      }),
    'Identifiers must not contain control characters.',
  );
const relayMessageContentSchema = z
  .string()
  .max(MAX_AI_MESSAGE_LENGTH)
  .refine((value) => value.trim().length > 0, 'Message content must not be blank.');
const relayReasonSchema = z
  .string()
  .max(MAX_AI_ACTIVITY_LENGTH)
  .refine((value) => value.trim().length > 0, 'Disconnect reason must not be blank.');

const relayToolResponseBase = {
  runId: relayIdentifierSchema,
  callId: relayIdentifierSchema,
  respondedAt: relayTimestampSchema,
};

export const relayToolResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ...relayToolResponseBase,
      ok: z.literal(true),
      result: jsonValueSchema,
      receipt: aiActionReceiptSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...relayToolResponseBase,
      ok: z.literal(false),
      error: aiBridgeErrorSchema,
    })
    .strict(),
]);

export const relayCreateSessionRequestSchema = z
  .object({ browserPublicKey: relayPublicKeySchema })
  .strict();

export const relayCreateSessionResponseSchema = z
  .object({
    sessionId: relaySessionIdSchema,
    pairingCode: relayPairingCodeSchema,
    browserToken: relayTokenSchema,
    expiresAt: relayTimestampSchema,
  })
  .strict();

export const relayClaimRequestSchema = z
  .object({
    terminalPublicKey: relayPublicKeySchema,
    client: aiClientIdentitySchema,
  })
  .strict();

export const relayClaimResponseSchema = z
  .object({
    sessionId: relaySessionIdSchema,
    browserPublicKey: relayPublicKeySchema,
    terminalToken: relayTokenSchema,
    expiresAt: relayTimestampSchema,
  })
  .strict();

export const relayPeerResponseSchema = z
  .object({
    terminalPublicKey: relayPublicKeySchema,
    client: aiClientIdentitySchema,
    expiresAt: relayTimestampSchema,
  })
  .strict();

export const relayMailboxWriteResponseSchema = z
  .object({ generation: relayGenerationSchema })
  .strict();

export const relayEnvelopeSchema = z
  .object({
    version: z.literal(AI_RELAY_ENVELOPE_VERSION),
    nonce: base64UrlSchema.refine(
      (value) => decodedLength(value) === 12,
      'Expected a 12-byte AES-GCM nonce.',
    ),
    ciphertext: base64UrlSchema.refine(
      (value) => (decodedLength(value) ?? 0) >= 16,
      'Expected AES-GCM ciphertext with an authentication tag.',
    ),
  })
  .strict();

const relayBrowserMessageBase = {
  messageId: relayIdentifierSchema,
  conversationId: relayIdentifierSchema,
  content: relayMessageContentSchema,
  createdAt: relayTimestampSchema,
  instructions: aiInstructionBundleSchema,
};

export const relayBrowserMessageSchema = z.discriminatedUnion('delivery', [
  z.object({ ...relayBrowserMessageBase, delivery: z.literal('queued') }).strict(),
  z
    .object({
      ...relayBrowserMessageBase,
      delivery: z.literal('claimed'),
      runId: relayIdentifierSchema,
    })
    .strict(),
  z
    .object({
      ...relayBrowserMessageBase,
      delivery: z.literal('stop_requested'),
      runId: relayIdentifierSchema,
    })
    .strict(),
]);

export const relayBrowserMailboxSchema = z
  .object({
    version: z.literal(AI_RELAY_PROTOCOL_VERSION),
    revision: relayRevisionSchema,
    messages: z.array(relayBrowserMessageSchema).max(MAX_AI_RELAY_MAILBOX_ENTRIES),
    toolResponses: z.array(relayToolResponseSchema).max(MAX_AI_RELAY_MAILBOX_ENTRIES),
    terminalRevisionSeen: relayRevisionSchema,
  })
  .strict();

export const relayTerminalEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      eventId: relayIdentifierSchema,
      type: z.literal('claimed'),
      messageId: relayIdentifierSchema,
      runId: relayIdentifierSchema,
      claimedAt: relayTimestampSchema,
      leaseExpiresAt: relayTimestampSchema,
    })
    .strict(),
  z
    .object({
      eventId: relayIdentifierSchema,
      type: z.literal('reply'),
      messageId: relayIdentifierSchema,
      runId: relayIdentifierSchema,
      content: relayMessageContentSchema,
      createdAt: relayTimestampSchema,
    })
    .strict(),
  z
    .object({
      eventId: relayIdentifierSchema,
      type: z.literal('tool_call'),
      runId: relayIdentifierSchema,
      callId: relayIdentifierSchema,
      toolName: aiToolNameSchema,
      input: boundedJsonValueSchema,
      createdAt: relayTimestampSchema,
    })
    .strict(),
  z
    .object({
      eventId: relayIdentifierSchema,
      type: z.literal('stop_acknowledged'),
      runId: relayIdentifierSchema,
      stoppedAt: relayTimestampSchema,
    })
    .strict(),
  z
    .object({
      eventId: relayIdentifierSchema,
      type: z.literal('disconnected'),
      disconnectedAt: relayTimestampSchema,
      reason: relayReasonSchema.optional(),
    })
    .strict(),
]);

export const relayTerminalMailboxSchema = z
  .object({
    version: z.literal(AI_RELAY_PROTOCOL_VERSION),
    revision: relayRevisionSchema,
    events: z.array(relayTerminalEventSchema).max(MAX_AI_RELAY_MAILBOX_ENTRIES),
    browserRevisionSeen: relayRevisionSchema,
  })
  .strict();

export type RelayCreateSessionRequest = z.infer<typeof relayCreateSessionRequestSchema>;
export type RelayCreatedSession = z.infer<typeof relayCreateSessionResponseSchema>;
export type RelayClaimRequest = z.infer<typeof relayClaimRequestSchema>;
export type RelayClaimResponse = z.infer<typeof relayClaimResponseSchema>;
export type RelayPeer = z.infer<typeof relayPeerResponseSchema>;
export type RelayMailboxWriteResponse = z.infer<typeof relayMailboxWriteResponseSchema>;
export type RelayEnvelope = z.infer<typeof relayEnvelopeSchema>;
export type RelayBrowserMessage = z.infer<typeof relayBrowserMessageSchema>;
export type RelayBrowserMailbox = z.infer<typeof relayBrowserMailboxSchema>;
export type RelayTerminalEvent = z.infer<typeof relayTerminalEventSchema>;
export type RelayTerminalMailbox = z.infer<typeof relayTerminalMailboxSchema>;
export type RelayToolResponse = z.infer<typeof relayToolResponseSchema>;
