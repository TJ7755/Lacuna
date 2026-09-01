import { z } from 'zod';

/** Version of the browser-facing AI contract, independent of MCP and database versions. */
export const LACUNA_AI_PROTOCOL_VERSION = 1 as const;

export const MAX_AI_IDENTIFIER_LENGTH = 160;
export const MAX_AI_CLIENT_NAME_LENGTH = 100;
export const MAX_AI_CLIENT_VERSION_LENGTH = 100;
export const MAX_AI_MESSAGE_LENGTH = 50_000;
export const MAX_AI_ACTIVITY_LENGTH = 1_000;
export const MAX_AI_INSTRUCTIONS_LENGTH = 200_000;
export const MAX_AI_TOOL_INPUT_BYTES = 64 * 1024;
export const MIN_AI_WAIT_MS = 250;
export const MAX_AI_WAIT_MS = 25_000;
export const MIN_AI_LEASE_MS = 5_000;
export const MAX_AI_LEASE_MS = 15 * 60_000;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isJsonValue(value: unknown, ancestors: Set<object> = new Set()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (ancestors.has(value)) return false;

  try {
    const nextAncestors = new Set(ancestors).add(value);
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const entries = Object.entries(descriptors).filter(([key]) => key !== 'length');
      if (entries.length !== value.length) return false;
      return entries.every(([key, descriptor]) => {
        const index = Number(key);
        return (
          Number.isInteger(index) &&
          index >= 0 &&
          index < value.length &&
          String(index) === key &&
          descriptor.enumerable === true &&
          'value' in descriptor &&
          isJsonValue(descriptor.value, nextAncestors)
        );
      });
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.values(descriptors).every(
      (descriptor) =>
        descriptor.enumerable === true &&
        'value' in descriptor &&
        isJsonValue(descriptor.value, nextAncestors),
    );
  } catch {
    return false;
  }
}

export const jsonValueSchema = z.custom<JsonValue>(isJsonValue, {
  message: 'Expected a finite, acyclic JSON value.',
});

export const boundedJsonValueSchema = jsonValueSchema.refine(
  (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_AI_TOOL_INPUT_BYTES,
  `JSON input must be at most ${MAX_AI_TOOL_INPUT_BYTES} bytes.`,
);

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

const identifierSchema = z
  .string()
  .min(1)
  .max(MAX_AI_IDENTIFIER_LENGTH)
  .refine((value) => value.trim() === value, 'Identifiers must not have surrounding whitespace.')
  .refine(
    (value) => !hasControlCharacter(value),
    'Identifiers must not contain control characters.',
  );

const requiredText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => value.trim().length > 0, 'Text must not be blank.');

const timeoutSchema = z.number().int().min(MIN_AI_WAIT_MS).max(MAX_AI_WAIT_MS);
const leaseSchema = z.number().int().min(MIN_AI_LEASE_MS).max(MAX_AI_LEASE_MS);
const timestampSchema = z.number().int().nonnegative().finite();

export const aiToolNameSchema = identifierSchema.regex(
  /^lacuna\.[a-z0-9_]+$/,
  'Tool names must use the lacuna.* namespace.',
);

export const aiClientIdentitySchema = z
  .object({
    name: requiredText(MAX_AI_CLIENT_NAME_LENGTH),
    version: requiredText(MAX_AI_CLIENT_VERSION_LENGTH).optional(),
  })
  .strict();

export type AiClientIdentity = z.infer<typeof aiClientIdentitySchema>;

export const aiEntityReferenceSchema = z
  .object({
    kind: z.enum(['course', 'lesson', 'card', 'concept', 'question', 'assessment']),
    id: identifierSchema,
    courseId: identifierSchema.optional(),
    label: requiredText(MAX_AI_ACTIVITY_LENGTH),
  })
  .strict();

export type AiEntityReference = z.infer<typeof aiEntityReferenceSchema>;

export const aiActivityUpdateSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('working'),
      summary: requiredText(MAX_AI_ACTIVITY_LENGTH),
      detail: requiredText(MAX_AI_ACTIVITY_LENGTH).optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal('idle'),
      summary: requiredText(MAX_AI_ACTIVITY_LENGTH).optional(),
    })
    .strict(),
]);

export type AiActivityUpdate = z.infer<typeof aiActivityUpdateSchema>;

export const aiAssistantReplySchema = z
  .object({
    content: requiredText(MAX_AI_MESSAGE_LENGTH),
    sources: z.array(aiEntityReferenceSchema).max(100).optional(),
  })
  .strict();

export type AiAssistantReply = z.infer<typeof aiAssistantReplySchema>;

const connectionRequestSchema = z
  .object({
    type: z.literal('connect'),
    protocolVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    client: aiClientIdentitySchema,
  })
  .strict();

const connectedRequestSchema = z.object({ connectionId: identifierSchema });
const runRequestSchema = z.object({ connectionId: identifierSchema, runId: identifierSchema });

const aiBridgeRequestSchema = z.discriminatedUnion('type', [
  connectionRequestSchema,
  connectedRequestSchema.extend({ type: z.literal('get_instructions') }).strict(),
  connectedRequestSchema
    .extend({
      type: z.literal('claim_message'),
      timeoutMs: timeoutSchema.optional(),
      leaseMs: leaseSchema.optional(),
    })
    .strict(),
  connectedRequestSchema.extend({ type: z.literal('list_pending') }).strict(),
  runRequestSchema.extend({ type: z.literal('get_run') }).strict(),
  runRequestSchema
    .extend({ type: z.literal('renew_lease'), leaseMs: leaseSchema.optional() })
    .strict(),
  runRequestSchema.extend({ type: z.literal('acknowledge_stop') }).strict(),
  runRequestSchema
    .extend({
      type: z.literal('set_activity'),
      activity: aiActivityUpdateSchema,
    })
    .strict(),
  runRequestSchema
    .extend({
      type: z.literal('invoke_tool'),
      callId: identifierSchema,
      call: z
        .object({
          name: aiToolNameSchema,
          input: boundedJsonValueSchema,
        })
        .strict(),
    })
    .strict(),
  runRequestSchema
    .extend({
      type: z.literal('reply'),
      messageId: identifierSchema,
      reply: aiAssistantReplySchema,
    })
    .strict(),
  connectedRequestSchema.extend({ type: z.literal('heartbeat') }).strict(),
  connectedRequestSchema.extend({ type: z.literal('disconnect') }).strict(),
]);

export type AiBridgeRequest = z.infer<typeof aiBridgeRequestSchema>;

export function isSupportedAiProtocolVersion(
  value: number,
): value is typeof LACUNA_AI_PROTOCOL_VERSION {
  return value === LACUNA_AI_PROTOCOL_VERSION;
}

/** Parse untrusted page-JavaScript input. The bridge must call this before reading any field. */
export function parseAiBridgeRequest(value: unknown): AiBridgeRequest {
  return aiBridgeRequestSchema.parse(value);
}

export function isAiBridgeRequest(value: unknown): value is AiBridgeRequest {
  return aiBridgeRequestSchema.safeParse(value).success;
}

export interface AiConnection {
  type: 'connection';
  connectionId: string;
  client: AiClientIdentity;
  connectedAt: number;
}

export const aiInstructionBundleSchema = z
  .object({
    type: z.literal('instructions'),
    protocolVersion: z.literal(LACUNA_AI_PROTOCOL_VERSION),
    instructionVersion: identifierSchema,
    content: requiredText(MAX_AI_INSTRUCTIONS_LENGTH),
    misconceptionFirstEnabled: z.boolean(),
  })
  .strict();

export type AiInstructionBundle = z.infer<typeof aiInstructionBundleSchema>;

export interface AiUserMessage {
  messageId: string;
  conversationId: string;
  content: string;
  createdAt: number;
}

export interface AiClaimedMessage extends AiUserMessage {
  runId: string;
  claimedAt: number;
  leaseExpiresAt: number;
}

export type AiRunStatus = 'active' | 'stop_requested' | 'stopped' | 'completed' | 'expired';

const aiApprovalBaseSchema = z.object({
  approvalId: identifierSchema,
  kind: z.enum(['write_grant', 'write_call', 'destructive_call']),
  toolName: requiredText(MAX_AI_IDENTIFIER_LENGTH),
  targetLabel: requiredText(MAX_AI_ACTIVITY_LENGTH),
  summary: requiredText(MAX_AI_ACTIVITY_LENGTH),
  requestedAt: timestampSchema,
});

const decidedApprovalSchema = (status: 'approved' | 'rejected') =>
  aiApprovalBaseSchema.extend({ status: z.literal(status), decidedAt: timestampSchema }).strict();

export const aiApprovalStateSchema = z
  .discriminatedUnion('status', [
    aiApprovalBaseSchema.extend({ status: z.literal('pending') }).strict(),
    decidedApprovalSchema('approved'),
    decidedApprovalSchema('rejected'),
    aiApprovalBaseSchema
      .extend({
        status: z.literal('consumed'),
        decidedAt: timestampSchema,
        consumedAt: timestampSchema,
      })
      .strict(),
    aiApprovalBaseSchema
      .extend({ status: z.literal('expired'), expiredAt: timestampSchema })
      .strict(),
  ])
  .superRefine((approval, context) => {
    if (approval.status !== 'pending') {
      const resolvedAt = approval.status === 'expired' ? approval.expiredAt : approval.decidedAt;
      if (resolvedAt < approval.requestedAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Approval resolution cannot predate its request.',
        });
      }
    }
    if (approval.status === 'consumed' && approval.consumedAt < approval.decidedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Approval consumption cannot predate its decision.',
      });
    }
  });

/**
 * Display-safe approval state. Exact target/input bindings remain inside Lacuna; an approval is
 * never represented by a bearer token exposed to the terminal client.
 */
export type AiApprovalState = z.infer<typeof aiApprovalStateSchema>;
export type AiApprovalKind = AiApprovalState['kind'];
export type AiApprovalStatus = AiApprovalState['status'];

export function isAiApprovalState(value: unknown): value is AiApprovalState {
  return aiApprovalStateSchema.safeParse(value).success;
}

interface AiRunBase {
  runId: string;
  conversationId: string;
  messageId: string;
  claimedAt: number;
  leaseExpiresAt: number;
  approval?: AiApprovalState;
}

export type AiRunState =
  | (AiRunBase & { status: 'active' })
  | (AiRunBase & { status: 'stop_requested'; stopRequestedAt: number })
  | (AiRunBase & { status: 'stopped'; stopRequestedAt: number; stoppedAt: number })
  | (AiRunBase & { status: 'completed'; completedAt: number })
  | (AiRunBase & { status: 'expired'; expiredAt: number });

export type AiConnectionState =
  | { status: 'connected'; connection: AiConnection; lastActivityAt: number }
  | { status: 'quiet'; connection: AiConnection; lastActivityAt: number }
  | { status: 'disconnected'; disconnectedAt: number };

export const aiActionReceiptSchema = z
  .object({
    receiptId: identifierSchema,
    callId: identifierSchema,
    toolName: aiToolNameSchema,
    summary: requiredText(MAX_AI_ACTIVITY_LENGTH),
    createdAt: timestampSchema,
    targets: z.array(aiEntityReferenceSchema).max(100),
  })
  .strict();

export type AiActionReceipt = z.infer<typeof aiActionReceiptSchema>;

export type AiBridgeSuccess =
  | AiConnection
  | AiInstructionBundle
  | { type: 'message_claim'; message: AiClaimedMessage | null }
  | { type: 'pending_messages'; messages: AiUserMessage[] }
  | { type: 'run_state'; run: AiRunState }
  | { type: 'lease_renewed'; runId: string; leaseExpiresAt: number }
  | { type: 'activity_recorded'; runId: string }
  | { type: 'tool_result'; callId: string; result: JsonValue; receipt?: AiActionReceipt }
  | { type: 'reply_recorded'; messageId: string }
  | { type: 'connection_state'; state: AiConnectionState }
  | { type: 'stop_acknowledged'; runId: string }
  | { type: 'disconnected' };

const errorMessageSchema = requiredText(MAX_AI_ACTIVITY_LENGTH);
const simpleErrorSchema = (kind: 'validation' | 'forbidden' | 'conflict' | 'internal') =>
  z.object({ kind: z.literal(kind), message: errorMessageSchema }).strict();
const approvalErrorFields = {
  approvalId: identifierSchema,
  approvalKind: z.enum(['write_grant', 'write_call', 'destructive_call']),
  message: errorMessageSchema,
} as const;

export const aiBridgeErrorSchema = z.discriminatedUnion('kind', [
  simpleErrorSchema('validation'),
  z
    .object({
      kind: z.literal('version_mismatch'),
      message: errorMessageSchema,
      supportedVersion: z.literal(LACUNA_AI_PROTOCOL_VERSION),
    })
    .strict(),
  z
    .object({
      kind: z.literal('unavailable'),
      reason: z.enum(['disabled', 'disconnected']),
      message: errorMessageSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal('stopped'), runId: identifierSchema, message: errorMessageSchema })
    .strict(),
  z.object({ kind: z.literal('approval_required'), ...approvalErrorFields }).strict(),
  z
    .object({
      kind: z.literal('approval_pending'),
      ...approvalErrorFields,
      retryAfterMs: timeoutSchema,
    })
    .strict(),
  simpleErrorSchema('forbidden'),
  simpleErrorSchema('conflict'),
  z
    .object({
      kind: z.literal('tool'),
      error: z
        .object({
          kind: z.enum(['not_found', 'validation', 'forbidden', 'conflict', 'internal']),
          message: errorMessageSchema,
        })
        .strict(),
    })
    .strict(),
  simpleErrorSchema('internal'),
]);

export type AiBridgeError = z.infer<typeof aiBridgeErrorSchema>;

export function isAiBridgeError(value: unknown): value is AiBridgeError {
  return aiBridgeErrorSchema.safeParse(value).success;
}

export type AiBridgeResult =
  | { ok: true; data: AiBridgeSuccess }
  | { ok: false; error: AiBridgeError };

/**
 * The sole page-JavaScript seam. Expected failures resolve as `AiBridgeResult`; implementations
 * catch unexpected exceptions and sanitise them to `internal` rather than leaking a stack.
 */
export interface LacunaAiBridge {
  readonly protocolVersion: typeof LACUNA_AI_PROTOCOL_VERSION;
  request(request: AiBridgeRequest): Promise<AiBridgeResult>;
}

/**
 * Stop takes effect when `stop_requested` is persisted. Calls admitted before that point may still
 * commit and must report their real outcome; acknowledgement coordinates presentation only.
 */
export const AI_STOP_SEMANTICS = {
  enforcementState: 'stop_requested',
  acknowledgementIsPermission: false,
  admittedCallsMayComplete: true,
} as const;

/**
 * Approval decisions remain server-held. Destructive approval is bound to one exact validated call,
 * is consumed once, and never becomes a session-wide destructive grant or terminal bearer token.
 */
export const AI_APPROVAL_SEMANTICS = {
  terminalBearerTokens: false,
  destructiveApprovalIsOneShot: true,
  binding: ['connectionId', 'runId', 'callId', 'toolName', 'target', 'validatedInput'] as const,
} as const;
