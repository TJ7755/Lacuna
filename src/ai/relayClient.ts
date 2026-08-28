import { DEFAULT_RELAY_URL } from '../sync/pairing';
import { bindFetch, normaliseRelayUrl } from '../sync/relay';
import {
  relayCreateSessionRequestSchema,
  relayCreateSessionResponseSchema,
  relayMailboxWriteResponseSchema,
  relayPeerResponseSchema,
  relaySessionIdSchema,
  relayTokenSchema,
  type RelayCreatedSession,
  type RelayPeer,
} from './relayProtocol';

const GENERATION_HEADER = 'X-Lacuna-Generation';
const RECOVERY_READ_OFFSETS_MS = [0, 250, 650] as const;
const RECOVERY_READ_TIMEOUT_MS = 250;
const RECOVERY_DEADLINE_MS = 1_000;

export interface RelayBrowserCredentials {
  sessionId: string;
  browserToken: string;
}

export interface RelayMailbox {
  bytes: Uint8Array;
  /** Opaque ETag, including quotes, to return unchanged in If-Match. */
  generation: string;
}

export interface RelayMailboxPush {
  generation: string;
}

export interface RelayClient {
  create(browserPublicKey: string): Promise<RelayCreatedSession>;
  peer(credentials: RelayBrowserCredentials): Promise<RelayPeer | null>;
  /** Browser role always reads the terminal-written mailbox. */
  pull(credentials: RelayBrowserCredentials): Promise<RelayMailbox | null>;
  /** Browser role always writes the browser mailbox. */
  push(
    credentials: RelayBrowserCredentials,
    bytes: Uint8Array,
    ifMatch: string,
  ): Promise<RelayMailboxPush>;
  revoke(credentials: RelayBrowserCredentials): Promise<void>;
}

export interface RelayClientOptions {
  relayUrl?: string;
  fetchImpl?: typeof fetch;
  recovery?: {
    now?: () => number;
    wait?: (milliseconds: number) => Promise<void>;
  };
}

export type RelayClientOperation = 'create' | 'peer' | 'pull' | 'push' | 'revoke';

export class RelayClientError extends Error {
  readonly operation: RelayClientOperation;
  readonly status?: number;

  constructor(message: string, options: { operation: RelayClientOperation; status?: number }) {
    super(message);
    this.name = 'RelayClientError';
    this.operation = options.operation;
    this.status = options.status;
  }
}

export class RelayClientConfigurationError extends RelayClientError {
  constructor(message: string) {
    super(message, { operation: 'create' });
    this.name = 'RelayClientConfigurationError';
  }
}

export class RelayClientProtocolError extends RelayClientError {
  constructor(message: string, operation: RelayClientOperation) {
    super(message, { operation });
    this.name = 'RelayClientProtocolError';
  }
}

export class RelayClientHttpError extends RelayClientError {
  constructor(message: string, operation: RelayClientOperation, status: number) {
    super(message, { operation, status });
    this.name = 'RelayClientHttpError';
  }
}

export class RelayStaleGenerationError extends RelayClientError {
  readonly attemptedGeneration: string;

  constructor(attemptedGeneration: string) {
    super('The AI relay mailbox changed before this update could be written.', {
      operation: 'push',
      status: 412,
    });
    this.name = 'RelayStaleGenerationError';
    this.attemptedGeneration = attemptedGeneration;
  }
}

export class RelayPushOutcomeUnknownError extends RelayClientError {
  constructor(status?: number) {
    super('The AI relay mailbox write outcome is unknown.', {
      operation: 'push',
      status,
    });
    this.name = 'RelayPushOutcomeUnknownError';
  }
}

export function createRelayClient(options: RelayClientOptions = {}): RelayClient {
  const relayUrl = relayUrlFor(options.relayUrl ?? DEFAULT_RELAY_URL);
  const fetcher = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    throw new RelayClientConfigurationError('This device does not provide fetch for the AI relay.');
  }
  const fetchImpl = bindFetch(fetcher);
  const recoveryTiming = {
    now: options.recovery?.now ?? (() => performance.now()),
    wait: options.recovery?.wait ?? wait,
  };

  return {
    async create(browserPublicKey) {
      const request = relayCreateSessionRequestSchema.safeParse({ browserPublicKey });
      if (!request.success) {
        throw new RelayClientProtocolError('The browser public key is invalid.', 'create');
      }
      const response = await fetchImpl(`${relayUrl}/ai/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.data),
      });
      if (!response.ok) throw await httpError('create', response);
      return parseJsonResponse(response, relayCreateSessionResponseSchema, 'create');
    },

    async peer(credentials) {
      const session = requireCredentials(credentials, 'peer');
      const response = await fetchImpl(`${relayUrl}/ai/s/${session.sessionId}/peer`, {
        method: 'GET',
        cache: 'no-store',
        headers: bearer(session.browserToken),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw await httpError('peer', response);
      return parseJsonResponse(response, relayPeerResponseSchema, 'peer');
    },

    async pull(credentials) {
      const session = requireCredentials(credentials, 'pull');
      const response = await fetchImpl(`${relayUrl}/ai/s/${session.sessionId}/terminal`, {
        method: 'GET',
        cache: 'no-store',
        headers: bearer(session.browserToken),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw await httpError('pull', response);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        generation: requireResponseGeneration(response, 'pull'),
      };
    },

    async push(credentials, bytes, ifMatch) {
      const session = requireCredentials(credentials, 'push');
      const generation = requireRequestGeneration(ifMatch);
      const body = copyBytes(bytes);
      const mailboxUrl = `${relayUrl}/ai/s/${session.sessionId}/browser`;
      let response: Response;
      try {
        response = await fetchImpl(mailboxUrl, {
          method: 'PUT',
          headers: {
            ...bearer(session.browserToken),
            'Content-Type': 'application/octet-stream',
            'If-Match': generation,
          },
          body: new Blob([body], { type: 'application/octet-stream' }),
        });
      } catch {
        return recoverPushGeneration(
          fetchImpl,
          mailboxUrl,
          session.browserToken,
          body,
          recoveryTiming,
        );
      }
      if (response.status === 412) throw new RelayStaleGenerationError(generation);
      if (response.status >= 500) {
        return recoverPushGeneration(
          fetchImpl,
          mailboxUrl,
          session.browserToken,
          body,
          recoveryTiming,
          response.status,
        );
      }
      if (!response.ok) throw await httpError('push', response);
      try {
        return { generation: await readPushGeneration(response) };
      } catch (error) {
        if (!(error instanceof RelayPushOutcomeUnknownError)) throw error;
        return recoverPushGeneration(
          fetchImpl,
          mailboxUrl,
          session.browserToken,
          body,
          recoveryTiming,
          response.status,
        );
      }
    },

    async revoke(credentials) {
      const session = requireCredentials(credentials, 'revoke');
      const response = await fetchImpl(`${relayUrl}/ai/s/${session.sessionId}`, {
        method: 'DELETE',
        headers: bearer(session.browserToken),
      });
      if (response.status === 404) return;
      if (!response.ok) throw await httpError('revoke', response);
    },
  };
}

function requireCredentials(
  credentials: RelayBrowserCredentials,
  operation: RelayClientOperation,
): RelayBrowserCredentials {
  const sessionId = relaySessionIdSchema.safeParse(credentials.sessionId);
  const browserToken = relayTokenSchema.safeParse(credentials.browserToken);
  if (!sessionId.success || !browserToken.success) {
    throw new RelayClientProtocolError('The AI relay session credentials are invalid.', operation);
  }
  return { sessionId: sessionId.data, browserToken: browserToken.data };
}

function relayUrlFor(value: string): string {
  try {
    return normaliseRelayUrl(value);
  } catch {
    throw new RelayClientConfigurationError('The AI relay URL is invalid.');
  }
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

function requireRequestGeneration(value: string): string {
  if (value.trim() === '' || value.trim() === '""') {
    throw new RelayClientProtocolError('The AI relay mailbox generation is invalid.', 'push');
  }
  return value;
}

function requireResponseGeneration(response: Response, operation: 'pull' | 'push'): string {
  const generation = response.headers.get(GENERATION_HEADER) ?? response.headers.get('ETag');
  if (!generation || generation.trim() === '' || generation.trim() === '""') {
    throw new RelayClientProtocolError(
      'The AI relay response did not include a mailbox generation.',
      operation,
    );
  }
  return generation;
}

async function readPushGeneration(response: Response): Promise<string> {
  if (response.status === 200) {
    try {
      const parsed = relayMailboxWriteResponseSchema.safeParse(await response.json());
      if (parsed.success) return parsed.data.generation;
    } catch {
      // Vercel may strip or replace a successful response body while preserving response headers.
    }
  }

  const generationHeaders = [response.headers.get(GENERATION_HEADER)];
  if (response.status === 204) generationHeaders.push(response.headers.get('ETag'));
  for (const headerGeneration of generationHeaders) {
    const parsedHeader = relayMailboxWriteResponseSchema.safeParse({
      generation: headerGeneration?.trim(),
    });
    if (parsedHeader.success) return parsedHeader.data.generation;
  }

  throw new RelayPushOutcomeUnknownError(response.status);
}

async function recoverPushGeneration(
  fetchImpl: typeof fetch,
  mailboxUrl: string,
  browserToken: string,
  attemptedBody: ArrayBuffer,
  timing: { now: () => number; wait: (milliseconds: number) => Promise<void> },
  status?: number,
): Promise<RelayMailboxPush> {
  const startedAt = timing.now();
  const deadline = startedAt + RECOVERY_DEADLINE_MS;
  let digest: string;
  try {
    digest = await sha256Hex(attemptedBody);
  } catch {
    throw new RelayPushOutcomeUnknownError(status);
  }
  const recoveryUrl = `${mailboxUrl}?digest=${digest}`;

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
      const response = await fetchImpl(recoveryUrl, {
        method: 'GET',
        cache: 'no-store',
        headers: bearer(browserToken),
        signal: controller.signal,
      });
      if (!response.ok) continue;
      return { generation: `"sha256:${digest}"` };
    } catch {
      // A read-only retry cannot overwrite a concurrent successor.
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new RelayPushOutcomeUnknownError(status);
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function parseJsonResponse<T>(
  response: Response,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  operation: 'create' | 'peer' | 'push',
): Promise<T> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new RelayClientProtocolError('The AI relay returned invalid JSON.', operation);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new RelayClientProtocolError('The AI relay returned an invalid response.', operation);
  }
  return parsed.data;
}

async function httpError(
  operation: RelayClientOperation,
  response: Response,
): Promise<RelayClientHttpError> {
  let reason = '';
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim() !== '') reason = ` ${body.error}.`;
  } catch {
    // The relay may answer without a readable JSON body.
  }
  return new RelayClientHttpError(
    `AI relay ${operation} failed with HTTP ${response.status}.${reason}`,
    operation,
    response.status,
  );
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
