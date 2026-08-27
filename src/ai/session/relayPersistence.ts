import type { RelayBrowserCredentials } from '../relayClient';
import type { RelayKeyPair } from '../relayCrypto';
import { relayBrowserMailboxSchema, type RelayBrowserMailbox } from '../relayProtocol';
import type { AiSessionSnapshot } from './types';

const STORAGE_KEY = 'lacuna-ai-relay-session-v1';

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
  terminalRevisionSeen: number;
  processedEventIds: string[];
}

export interface RelayDeviceState {
  snapshot: AiSessionSnapshot;
  connection: PersistedRelayConnection | null;
}

interface StoredRelayDeviceState {
  version: 2;
  snapshot: AiSessionSnapshot;
  connection: PersistedRelayConnection | null;
}

export interface RelaySessionPersistence {
  load(): RelayDeviceState | null;
  save(state: RelayDeviceState): void;
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
        const stored: StoredRelayDeviceState = { version: 2, ...state };
        storage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch {
        // The active in-memory session remains usable when browser storage is unavailable.
      }
    },
  };
}

function parseStoredState(value: unknown): RelayDeviceState | null {
  if (!isRecord(value) || !isSnapshot(value.snapshot)) return null;
  if (value.version === 2) {
    if (value.connection === null) return { snapshot: value.snapshot, connection: null };
    const connection = parseConnection(value.connection);
    return connection ? { snapshot: value.snapshot, connection } : null;
  }
  if (value.version === 1) {
    const connection = parseConnection(value);
    return connection ? { snapshot: value.snapshot, connection } : null;
  }
  return null;
}

function parseConnection(value: unknown): PersistedRelayConnection | null {
  if (!isRecord(value)) return null;
  if (
    !isRecord(value.credentials) ||
    typeof value.credentials.sessionId !== 'string' ||
    typeof value.credentials.browserToken !== 'string' ||
    !isRecord(value.keyPair) ||
    typeof value.keyPair.publicKey !== 'string' ||
    typeof value.keyPair.privateKey !== 'string'
  ) {
    return null;
  }
  if (value.peerPublicKey !== null && typeof value.peerPublicKey !== 'string') {
    return null;
  }
  if (
    typeof value.browserGeneration !== 'string' ||
    !relayBrowserMailboxSchema.safeParse(value.browserMailbox).success ||
    !Number.isInteger(value.terminalRevisionSeen) ||
    typeof value.terminalRevisionSeen !== 'number' ||
    value.terminalRevisionSeen < 0 ||
    !Array.isArray(value.processedEventIds) ||
    !value.processedEventIds.every((eventId) => typeof eventId === 'string')
  ) {
    return null;
  }
  return {
    credentials: {
      sessionId: value.credentials.sessionId,
      browserToken: value.credentials.browserToken,
    },
    keyPair: {
      publicKey: value.keyPair.publicKey,
      privateKey: value.keyPair.privateKey,
    },
    peerPublicKey: value.peerPublicKey,
    browserGeneration: value.browserGeneration,
    browserMailbox: relayBrowserMailboxSchema.parse(value.browserMailbox),
    terminalRevisionSeen: value.terminalRevisionSeen,
    processedEventIds: value.processedEventIds,
  };
}

function isSnapshot(value: unknown): value is AiSessionSnapshot {
  if (!isRecord(value) || !Number.isInteger(value.revision) || !isRecord(value.connection)) {
    return false;
  }
  const status = value.connection.status;
  const validConnection =
    status === 'disconnected' ||
    (status === 'pairing' &&
      typeof value.connection.code === 'string' &&
      typeof value.connection.expiresAt === 'number') ||
    ((status === 'connected' || status === 'quiet') &&
      typeof value.connection.connectionId === 'string' &&
      isRecord(value.connection.client) &&
      typeof value.connection.client.name === 'string' &&
      typeof value.connection.lastActivityAt === 'number');
  return (
    validConnection &&
    Array.isArray(value.items) &&
    value.items.every(isRecord) &&
    (value.conversationId === null || typeof value.conversationId === 'string') &&
    (value.run === null || isRecord(value.run)) &&
    (value.activity === null || isRecord(value.activity)) &&
    (value.approval === null || isRecord(value.approval)) &&
    typeof value.draft === 'string' &&
    (value.queuedFollowUp === null || typeof value.queuedFollowUp === 'string')
  );
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
