import { z } from 'zod';
import type { RelayBrowserCredentials } from '../relayClient';
import type { RelayKeyPair } from '../relayCrypto';
import {
  MAX_AI_ACTIVITY_LENGTH,
  MAX_AI_IDENTIFIER_LENGTH,
  MAX_AI_MESSAGE_LENGTH,
  aiApprovalStateSchema,
  aiBridgeErrorSchema,
  aiClientIdentitySchema,
  aiEntityReferenceSchema,
} from '../protocol';
import {
  MAX_AI_RELAY_MAILBOX_ENTRIES,
  relayBrowserMailboxSchema,
  relayPublicKeySchema,
  relaySessionIdSchema,
  relayTokenSchema,
  type RelayBrowserMailbox,
} from '../relayProtocol';
import { restoreState as restoreToolSessionState } from '../toolSession/state';
import type { AiToolSessionState } from '../toolSession';
import type { AiSessionSnapshot } from './types';

const STORAGE_KEY = 'lacuna-ai-relay-session-v1';
const PROTOCOL_UPDATED_REASON = 'Reconnect the terminal after the AI protocol update.';

export interface RelaySessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedRelayConnection {
  credentials: RelayBrowserCredentials;
  keyPair: RelayKeyPair;
  peerPublicKey: string | null;
  browserGeneration: string;
  browserMailbox: RelayBrowserMailbox;
  queuedFollowUpMessageId: string | null;
  terminalRevisionSeen: number;
  processedEventIds: string[];
  toolSessionState: AiToolSessionState;
}

export interface RelayDeviceState {
  snapshot: AiSessionSnapshot;
  connection: PersistedRelayConnection | null;
}

interface StoredRelayDeviceState {
  version: 4;
  snapshot: AiSessionSnapshot;
  connection: PersistedRelayConnection | null;
}

export interface RelaySessionPersistence {
  load(): RelayDeviceState | null;
  save(state: RelayDeviceState): void;
  clear(): void;
}

export function createRelaySessionPersistence(
  storage: RelaySessionStorage,
): RelaySessionPersistence {
  return {
    load() {
      let encoded: string | null;
      try {
        encoded = storage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
      if (!encoded) return null;
      try {
        const value = JSON.parse(encoded) as unknown;
        const parsed = parseStoredState(value);
        if (parsed) return parsed;
      } catch {
        // Invalid local data is discarded below.
      }
      removeStoredState(storage);
      return null;
    },
    save(state) {
      try {
        const stored: StoredRelayDeviceState = { version: 4, ...state };
        storage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch {
        // The active in-memory session remains usable when browser storage is unavailable.
      }
    },
    clear() {
      removeStoredState(storage);
    },
  };
}

function parseStoredState(value: unknown): RelayDeviceState | null {
  if (!isRecord(value)) return null;
  const parsedSnapshot = snapshotSchema.safeParse(value.snapshot);
  if (!parsedSnapshot.success) return null;
  const snapshot: AiSessionSnapshot = parsedSnapshot.data;
  if (value.version === 4) {
    if (value.connection === null) {
      return snapshot.connection.status === 'disconnected' ? { snapshot, connection: null } : null;
    }
    const connection = parseConnection(value.connection);
    return connection && connectionMatchesSnapshot(connection, snapshot)
      ? { snapshot, connection: recoverQueuedFollowUpIdentity(connection, snapshot) }
      : null;
  }
  if (value.version === 3 || value.version === 2 || value.version === 1) {
    return disconnectLegacySession(snapshot);
  }
  return null;
}

function recoverQueuedFollowUpIdentity(
  connection: PersistedRelayConnection,
  snapshot: AiSessionSnapshot,
): PersistedRelayConnection {
  if (connection.queuedFollowUpMessageId || snapshot.queuedFollowUp === null) return connection;
  const transcriptMessageIds = new Set(
    snapshot.items.filter((item) => item.kind === 'user').map((item) => item.id),
  );
  const candidates = connection.browserMailbox.messages.filter(
    (message) => message.delivery === 'queued' && !transcriptMessageIds.has(message.messageId),
  );
  return candidates.length === 1
    ? { ...connection, queuedFollowUpMessageId: candidates[0]!.messageId }
    : connection;
}

function parseConnection(value: unknown): PersistedRelayConnection | null {
  const parsed = persistedConnectionSchema.safeParse(value);
  return parsed.success
    ? { ...parsed.data, toolSessionState: restoreToolSessionState(parsed.data.toolSessionState) }
    : null;
}

function disconnectLegacySession(snapshot: AiSessionSnapshot): RelayDeviceState {
  const interruptedMessageId =
    snapshot.run?.status === 'active' || snapshot.run?.status === 'stop_requested'
      ? snapshot.run.messageId
      : null;
  return {
    snapshot: {
      ...snapshot,
      connection: { status: 'disconnected', reason: PROTOCOL_UPDATED_REASON },
      items: interruptedMessageId
        ? snapshot.items.map((item) =>
            item.kind === 'user' && item.id === interruptedMessageId
              ? { ...item, delivery: 'stopped' as const }
              : item,
          )
        : snapshot.items,
      run: null,
      activity: null,
      approval: null,
    },
    connection: null,
  };
}

function connectionMatchesSnapshot(
  connection: PersistedRelayConnection,
  snapshot: AiSessionSnapshot,
): boolean {
  if (snapshot.connection.status === 'pairing') return connection.peerPublicKey === null;
  if (snapshot.connection.status === 'connected' || snapshot.connection.status === 'quiet') {
    return (
      connection.peerPublicKey !== null &&
      snapshot.connection.connectionId === connection.credentials.sessionId
    );
  }
  return true;
}

const identifierSchema = z
  .string()
  .min(1)
  .max(MAX_AI_IDENTIFIER_LENGTH)
  .refine((value) => value.trim() === value)
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      }),
  );
const timestampSchema = z.number().int().nonnegative().finite();
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const messageSchema = z
  .string()
  .max(MAX_AI_MESSAGE_LENGTH)
  .refine((value) => value.trim().length > 0);
const activityTextSchema = z
  .string()
  .max(MAX_AI_ACTIVITY_LENGTH)
  .refine((value) => value.trim().length > 0);

const mailboxGenerationSchema = z
  .string()
  .min(1)
  .max(MAX_AI_IDENTIFIER_LENGTH)
  .refine((value) => value.trim() !== '' && value.trim() !== '""');

const exportedPrivateKeySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine(isP256Pkcs8PrivateKey);

const persistedConnectionSchema = z
  .object({
    credentials: z
      .object({ sessionId: relaySessionIdSchema, browserToken: relayTokenSchema })
      .strict(),
    keyPair: z
      .object({ publicKey: relayPublicKeySchema, privateKey: exportedPrivateKeySchema })
      .strict(),
    peerPublicKey: relayPublicKeySchema.nullable(),
    browserGeneration: mailboxGenerationSchema,
    browserMailbox: relayBrowserMailboxSchema,
    queuedFollowUpMessageId: identifierSchema.nullable().optional().default(null),
    terminalRevisionSeen: revisionSchema,
    processedEventIds: z.array(identifierSchema).max(MAX_AI_RELAY_MAILBOX_ENTRIES),
    toolSessionState: z
      .object({
        grants: z.array(z.unknown()).max(100),
        approvals: z.array(z.unknown()).max(100),
        ledger: z.array(z.unknown()).max(500),
      })
      .strict(),
  })
  .strict();

const connectionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('disconnected'), reason: activityTextSchema.optional() }).strict(),
  z
    .object({ status: z.literal('pairing'), code: identifierSchema, expiresAt: timestampSchema })
    .strict(),
  z
    .object({
      status: z.literal('connected'),
      connectionId: identifierSchema,
      client: aiClientIdentitySchema,
      lastActivityAt: timestampSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('quiet'),
      connectionId: identifierSchema,
      client: aiClientIdentitySchema,
      lastActivityAt: timestampSchema,
    })
    .strict(),
]);

const receiptSchema = z
  .object({
    receiptId: identifierSchema,
    callId: identifierSchema,
    toolName: activityTextSchema,
    summary: activityTextSchema,
    createdAt: timestampSchema,
    targets: z.array(aiEntityReferenceSchema).max(100),
  })
  .strict();

const conversationItemSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('user'),
      id: identifierSchema,
      content: messageSchema,
      createdAt: timestampSchema,
      delivery: z.enum(['queued', 'claimed', 'completed', 'stopped']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('assistant'),
      id: identifierSchema,
      content: messageSchema,
      createdAt: timestampSchema,
      sources: z.array(aiEntityReferenceSchema).max(100),
    })
    .strict(),
  z.object({ kind: z.literal('receipt'), id: identifierSchema, receipt: receiptSchema }).strict(),
  z
    .object({
      kind: z.literal('error'),
      id: identifierSchema,
      error: aiBridgeErrorSchema,
      createdAt: timestampSchema,
    })
    .strict(),
]);

const runBase = {
  runId: identifierSchema,
  conversationId: identifierSchema,
  messageId: identifierSchema,
  claimedAt: timestampSchema,
  leaseExpiresAt: timestampSchema,
  approval: aiApprovalStateSchema.optional(),
};

const runSchema = z.discriminatedUnion('status', [
  z.object({ ...runBase, status: z.literal('active') }).strict(),
  z
    .object({ ...runBase, status: z.literal('stop_requested'), stopRequestedAt: timestampSchema })
    .strict(),
  z
    .object({
      ...runBase,
      status: z.literal('stopped'),
      stopRequestedAt: timestampSchema,
      stoppedAt: timestampSchema,
    })
    .strict(),
  z.object({ ...runBase, status: z.literal('completed'), completedAt: timestampSchema }).strict(),
  z.object({ ...runBase, status: z.literal('expired'), expiredAt: timestampSchema }).strict(),
]);

const activitySchema = z
  .object({
    runId: identifierSchema,
    status: z.enum(['working', 'awaiting_approval', 'stop_requested', 'failed', 'completed']),
    summary: activityTextSchema,
    detail: activityTextSchema.optional(),
    updatedAt: timestampSchema,
  })
  .strict();

const snapshotSchema = z
  .object({
    revision: revisionSchema,
    connection: connectionSchema,
    conversationId: identifierSchema.nullable(),
    items: z.array(conversationItemSchema).max(MAX_AI_RELAY_MAILBOX_ENTRIES),
    run: runSchema.nullable(),
    activity: activitySchema.nullable(),
    approval: aiApprovalStateSchema.nullable(),
    draft: z.string().max(MAX_AI_MESSAGE_LENGTH),
    queuedFollowUp: messageSchema.nullable(),
  })
  .strict();

function isP256Pkcs8PrivateKey(value: string): boolean {
  try {
    const padded =
      value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return (
      bytes.length >= 120 &&
      bytes.length <= 256 &&
      bytes[0] === 0x30 &&
      containsBytes(bytes, [0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]) &&
      containsBytes(bytes, [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07])
    );
  } catch {
    return false;
  }
}

function containsBytes(bytes: Uint8Array, expected: readonly number[]): boolean {
  for (let start = 0; start <= bytes.length - expected.length; start += 1) {
    if (expected.every((byte, offset) => bytes[start + offset] === byte)) return true;
  }
  return false;
}

function removeStoredState(storage: RelaySessionStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Browser storage may be disabled or unavailable.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
