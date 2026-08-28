import { createHash } from 'node:crypto';
import type { AiClientIdentity, JsonValue } from '../../../src/ai/protocol.js';
import {
  createRelayKeyPair,
  deriveRelayEncryptionKey,
  openRelayJson,
  sealRelayJson,
  type RelayKeyPair,
} from '../../../src/ai/relayCrypto.js';
import {
  relayBrowserMailboxSchema,
  relayClaimResponseSchema,
  relayEnvelopeSchema,
  relayMailboxWriteResponseSchema,
  relayTerminalMailboxSchema,
  type RelayEnvelope,
  type RelayTerminalMailbox,
} from '../../../src/ai/relayProtocol.js';
import { normaliseRelayUrl } from '../../../src/sync/relay.js';
import {
  TerminalRelayReconnectRequiredError,
  type ConnectedTerminalRelay,
  type TerminalRelayTransport,
} from './client.js';

const CONNECTION_AUTH = Symbol('terminal-relay-auth');
const GENERATION_HEADER = 'X-Lacuna-Generation';
const RECOVERY_READ_OFFSETS_MS = [0, 250, 650] as const;
const RECOVERY_READ_TIMEOUT_MS = 250;
const RECOVERY_DEADLINE_MS = 1_000;

export { normaliseRelayUrl };

interface HttpConnectedTerminalRelay extends ConnectedTerminalRelay {
  [CONNECTION_AUTH]: { terminalToken: string; key: CryptoKey };
}

export interface RelayCryptoOperations {
  createKeyPair(): Promise<RelayKeyPair>;
  deriveKey(privateKey: string, peerPublicKey: string): Promise<CryptoKey>;
  seal(key: CryptoKey, value: JsonValue): Promise<RelayEnvelope>;
  open(key: CryptoKey, envelope: unknown): Promise<JsonValue>;
}

export interface HttpTerminalRelayTransportOptions {
  fetchImpl?: typeof fetch;
  crypto?: RelayCryptoOperations;
  recovery?: {
    now?: () => number;
    wait?: (milliseconds: number) => Promise<void>;
  };
}

const defaultCrypto: RelayCryptoOperations = {
  createKeyPair: createRelayKeyPair,
  deriveKey: deriveRelayEncryptionKey,
  seal: sealRelayJson,
  open: openRelayJson,
};

export class HttpTerminalRelayTransport implements TerminalRelayTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly crypto: RelayCryptoOperations;
  private readonly recoveryTiming: {
    now: () => number;
    wait: (milliseconds: number) => Promise<void>;
  };

  constructor(options: HttpTerminalRelayTransportOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.crypto = options.crypto ?? defaultCrypto;
    this.recoveryTiming = {
      now: options.recovery?.now ?? (() => performance.now()),
      wait: options.recovery?.wait ?? wait,
    };
  }

  async connect(
    code: string,
    relayUrl: string,
    client: AiClientIdentity,
  ): Promise<ConnectedTerminalRelay> {
    const baseUrl = normaliseRelayUrl(relayUrl);
    const pair = await this.crypto.createKeyPair();
    const body = JSON.stringify({ terminalPublicKey: pair.publicKey, client });
    const response = await this.fetchImpl(`${baseUrl}/ai/s/${encodeURIComponent(code)}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });
    if (!response.ok) throw relayHttpError('claim the Lacuna AI session', response.status);
    const parsed = relayClaimResponseSchema.safeParse(await readJsonResponse(response));
    if (!parsed.success) throw new Error('The relay returned an invalid claim response.');
    const key = await this.crypto.deriveKey(pair.privateKey, parsed.data.browserPublicKey);
    const connection: HttpConnectedTerminalRelay = {
      relayUrl: baseUrl,
      sessionId: parsed.data.sessionId,
      expiresAt: parsed.data.expiresAt,
      [CONNECTION_AUTH]: { terminalToken: parsed.data.terminalToken, key },
    };
    return connection;
  }

  async readBrowserMailbox(connection: ConnectedTerminalRelay): Promise<{
    generation: string;
    mailbox: ReturnType<typeof relayBrowserMailboxSchema.parse>;
  } | null> {
    const authenticated = authenticatedConnection(connection);
    const response = await this.fetchImpl(
      `${connection.relayUrl}/ai/s/${connection.sessionId}/browser`,
      { headers: { Authorization: `Bearer ${authenticated.terminalToken}` } },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw relayHttpError('read the Lacuna AI browser mailbox', response.status);
    const generation = requiredEtag(response);
    const envelope = relayEnvelopeSchema.safeParse(await readJsonResponse(response));
    if (!envelope.success) throw new Error('The relay returned an invalid encrypted mailbox.');
    const opened = await this.crypto.open(authenticated.key, envelope.data);
    const mailbox = relayBrowserMailboxSchema.safeParse(opened);
    if (!mailbox.success) throw new Error('The browser mailbox payload is invalid.');
    return { generation, mailbox: mailbox.data };
  }

  async writeTerminalMailbox(
    connection: ConnectedTerminalRelay,
    generation: string,
    mailbox: RelayTerminalMailbox,
  ): Promise<string> {
    const authenticated = authenticatedConnection(connection);
    const parsedMailbox = relayTerminalMailboxSchema.safeParse(mailbox);
    if (!parsedMailbox.success) throw new Error('The terminal mailbox payload is invalid.');
    const envelope = await this.crypto.seal(
      authenticated.key,
      parsedMailbox.data as unknown as JsonValue,
    );
    const body = JSON.stringify(envelope);
    const mailboxUrl = `${connection.relayUrl}/ai/s/${connection.sessionId}/terminal`;
    let response: Response;
    try {
      response = await this.fetchImpl(mailboxUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authenticated.terminalToken}`,
          'Content-Type': 'application/octet-stream',
          'If-Match': generation,
        },
        body,
      });
    } catch {
      return recoverTerminalWrite(
        this.fetchImpl,
        mailboxUrl,
        authenticated.terminalToken,
        body,
        this.recoveryTiming,
      );
    }
    if (response.status === 412) {
      throw new TerminalRelayReconnectRequiredError('terminal_writer_changed');
    }
    if (!response.ok) {
      if (response.status >= 500) {
        return recoverTerminalWrite(
          this.fetchImpl,
          mailboxUrl,
          authenticated.terminalToken,
          body,
          this.recoveryTiming,
        );
      }
      throw relayHttpError('write the Lacuna AI terminal mailbox', response.status);
    }
    if (response.status === 200) {
      return `"sha256:${createHash('sha256').update(body, 'utf8').digest('hex')}"`;
    }
    const responseGeneration = await terminalWriteGeneration(response);
    if (responseGeneration) return responseGeneration;
    return recoverTerminalWrite(
      this.fetchImpl,
      mailboxUrl,
      authenticated.terminalToken,
      body,
      this.recoveryTiming,
    );
  }
}

async function terminalWriteGeneration(response: Response): Promise<string | null> {
  if (response.status === 200) {
    try {
      const result = relayMailboxWriteResponseSchema.safeParse(await readJsonResponse(response));
      if (result.success) return result.data.generation;
    } catch {
      // A successful response may lose or corrupt its JSON body in transit.
    }
  }

  const headerGenerations = [response.headers.get(GENERATION_HEADER)];
  if (response.status === 204) headerGenerations.push(response.headers.get('ETag'));
  for (const generation of headerGenerations) {
    const parsed = relayMailboxWriteResponseSchema.safeParse({ generation: generation?.trim() });
    if (parsed.success) return parsed.data.generation;
  }
  return null;
}

async function recoverTerminalWrite(
  fetchImpl: typeof fetch,
  mailboxUrl: string,
  terminalToken: string,
  attemptedBody: string,
  timing: { now: () => number; wait: (milliseconds: number) => Promise<void> },
): Promise<string> {
  const startedAt = timing.now();
  const deadline = startedAt + RECOVERY_DEADLINE_MS;
  const attemptedDigest = createHash('sha256').update(attemptedBody, 'utf8').digest('hex');
  const receiptUrl = `${mailboxUrl}?digest=${attemptedDigest}`;

  for (const offsetMs of RECOVERY_READ_OFFSETS_MS) {
    const delayMs = startedAt + offsetMs - timing.now();
    if (delayMs > 0) await timing.wait(delayMs);
    const remainingMs = deadline - timing.now();
    if (remainingMs <= 0) break;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(RECOVERY_READ_TIMEOUT_MS, remainingMs),
    );
    try {
      const response = await fetchImpl(receiptUrl, {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${terminalToken}` },
        signal: controller.signal,
      });
      if (!response.ok) continue;
      return `"sha256:${attemptedDigest}"`;
    } catch {
      // A read-only retry cannot overwrite a concurrent successor.
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new TerminalRelayReconnectRequiredError();
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function authenticatedConnection(connection: ConnectedTerminalRelay): {
  terminalToken: string;
  key: CryptoKey;
} {
  const authenticated = (connection as Partial<HttpConnectedTerminalRelay>)[CONNECTION_AUTH];
  if (!authenticated) throw new Error('The relay connection does not belong to this transport.');
  return authenticated;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch {
    throw new Error('The relay returned invalid JSON.');
  }
}

function requiredEtag(response: Response): string {
  const etag = (response.headers.get(GENERATION_HEADER) ?? response.headers.get('ETag'))?.trim();
  if (!etag || etag === '""') throw new Error('The relay response is missing its generation.');
  return etag;
}

function relayHttpError(action: string, status: number): Error {
  return new Error(`Could not ${action}: relay HTTP ${status}.`);
}
