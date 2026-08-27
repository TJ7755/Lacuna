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
  relayTerminalMailboxSchema,
  type RelayEnvelope,
  type RelayTerminalMailbox,
} from '../../../src/ai/relayProtocol.js';
import type {
  ConnectedTerminalRelay,
  TerminalRelayTransport,
} from './client.js';

const CONNECTION_AUTH = Symbol('terminal-relay-auth');

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

  constructor(options: HttpTerminalRelayTransportOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.crypto = options.crypto ?? defaultCrypto;
  }

  async connect(
    code: string,
    relayUrl: string,
    client: AiClientIdentity,
  ): Promise<ConnectedTerminalRelay> {
    const baseUrl = normaliseRelayUrl(relayUrl);
    const pair = await this.crypto.createKeyPair();
    const body = JSON.stringify({ terminalPublicKey: pair.publicKey, client });
    const response = await this.fetchImpl(
      `${baseUrl}/ai/s/${encodeURIComponent(code)}/claim`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(new TextEncoder().encode(body).byteLength),
        },
        body,
      },
    );
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
    const response = await this.fetchImpl(
      `${connection.relayUrl}/ai/s/${connection.sessionId}/terminal`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${authenticated.terminalToken}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(new TextEncoder().encode(body).byteLength),
          'If-Match': generation,
        },
        body,
      },
    );
    if (response.status === 412) {
      throw new Error('Another terminal writer changed this Lacuna AI session.');
    }
    if (response.status !== 204) {
      throw relayHttpError('write the Lacuna AI terminal mailbox', response.status);
    }
    return requiredEtag(response);
  }
}

export function normaliseRelayUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The relay URL is invalid.');
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '::1' ||
    /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('The relay URL must use HTTPS outside loopback.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('The relay URL must not contain credentials, a query or a fragment.');
  }
  return url.toString().replace(/\/$/, '');
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
  const etag = response.headers.get('ETag')?.trim();
  if (!etag || etag === '""') throw new Error('The relay response is missing its ETag.');
  return etag;
}

function relayHttpError(action: string, status: number): Error {
  return new Error(`Could not ${action}: relay HTTP ${status}.`);
}
