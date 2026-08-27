import { DEFAULT_RELAY_URL } from '../sync/pairing';
import { bindFetch, normaliseRelayUrl } from '../sync/relay';
import {
  relayCreateSessionRequestSchema,
  relayCreateSessionResponseSchema,
  relayPeerResponseSchema,
  relaySessionIdSchema,
  relayTokenSchema,
  type RelayCreatedSession,
  type RelayPeer,
} from './relayProtocol';

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
}

export type RelayClientOperation = 'create' | 'peer' | 'pull' | 'push' | 'revoke';

export class RelayClientError extends Error {
  readonly operation: RelayClientOperation;
  readonly status?: number;

  constructor(
    message: string,
    options: { operation: RelayClientOperation; status?: number },
  ) {
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

export function createRelayClient(options: RelayClientOptions = {}): RelayClient {
  const relayUrl = relayUrlFor(options.relayUrl ?? DEFAULT_RELAY_URL);
  const fetcher = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    throw new RelayClientConfigurationError('This device does not provide fetch for the AI relay.');
  }
  const fetchImpl = bindFetch(fetcher);

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
      const response = await fetchImpl(`${relayUrl}/ai/s/${session.sessionId}/browser`, {
        method: 'PUT',
        headers: {
          ...bearer(session.browserToken),
          'Content-Type': 'application/octet-stream',
          'If-Match': generation,
        },
        body: new Blob([body], { type: 'application/octet-stream' }),
      });
      if (response.status === 412) throw new RelayStaleGenerationError(generation);
      if (!response.ok) throw await httpError('push', response);
      return { generation: requireResponseGeneration(response, 'push') };
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

function requireResponseGeneration(
  response: Response,
  operation: 'pull' | 'push',
): string {
  const generation = response.headers.get('ETag');
  if (!generation || generation.trim() === '' || generation.trim() === '""') {
    throw new RelayClientProtocolError(
      'The AI relay response did not include a mailbox generation.',
      operation,
    );
  }
  return generation;
}

async function parseJsonResponse<T>(
  response: Response,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  operation: 'create' | 'peer',
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
