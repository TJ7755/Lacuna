// P5 transport seam. This module knows how to move opaque bytes, but not how
// snapshots are encoded, encrypted, or merged. The manual provider is a
// callback adapter so the existing file-based Combine flow remains the
// configuration-free fallback without bringing DOM APIs into the sync cycle.

export const EMPTY_GENERATION = '"0"';

export type RelaySlot = 'state' | 'keybag';

export interface RelayBlob {
  bytes: Uint8Array;
  /** The opaque ETag returned by the relay, including its quotes. */
  generation: string;
}

export interface RelayPushResult {
  generation: string;
}

export interface RelayProvider {
  pull(slot: RelaySlot): Promise<RelayBlob | null>;
  push(slot: RelaySlot, bytes: Uint8Array, ifMatch: string): Promise<RelayPushResult>;
  purge(): Promise<void>;
}

export type RelayOperation = 'pull' | 'push' | 'purge';

export class RelayError extends Error {
  readonly operation: RelayOperation;
  readonly status?: number;

  constructor(message: string, options: { operation: RelayOperation; status?: number }) {
    super(message);
    this.name = 'RelayError';
    this.operation = options.operation;
    this.status = options.status;
  }
}

export class RelayConfigurationError extends RelayError {
  constructor(message: string) {
    super(message, { operation: 'pull' });
    this.name = 'RelayConfigurationError';
  }
}

export class RelayProtocolError extends RelayError {
  constructor(message: string, operation: RelayOperation) {
    super(message, { operation });
    this.name = 'RelayProtocolError';
  }
}

export class StaleGenerationError extends RelayError {
  readonly attemptedGeneration: string;

  constructor(attemptedGeneration: string) {
    super('Another device changed the sync channel. Lacuna will pull again before retrying.', {
      operation: 'push',
      status: 412,
    });
    this.name = 'StaleGenerationError';
    this.attemptedGeneration = attemptedGeneration;
  }
}

export class RelayHttpError extends RelayError {
  constructor(message: string, operation: RelayOperation, status: number) {
    super(message, { operation, status });
    this.name = 'RelayHttpError';
  }
}

/**
 * A transport supplied by the existing manual file flow. The callbacks are
 * deliberately the same shape as RelayProvider so a future picker can hand
 * files to the cycle without making the cycle know about the DOM.
 */
export type ManualRelayAdapter = RelayProvider;

export class ManualRelayProvider implements RelayProvider {
  private readonly adapter: ManualRelayAdapter;

  constructor(adapter: ManualRelayAdapter) {
    this.adapter = adapter;
  }

  pull(slot: RelaySlot): Promise<RelayBlob | null> {
    return this.adapter.pull(slot);
  }

  push(slot: RelaySlot, bytes: Uint8Array, ifMatch: string): Promise<RelayPushResult> {
    return this.adapter.push(slot, bytes, ifMatch);
  }

  purge(): Promise<void> {
    return this.adapter.purge();
  }
}

export interface HttpRelayProviderOptions {
  relayUrl: string;
  channelId: string;
  writeToken: string;
  fetchImpl?: typeof fetch;
}

/** HTTP adapter for the standalone Lacuna relay. */
export class HttpRelayProvider implements RelayProvider {
  private readonly relayUrl: string;
  private readonly channelId: string;
  private readonly writeToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpRelayProviderOptions) {
    this.relayUrl = normaliseRelayUrl(options.relayUrl);
    this.channelId = requireChannelId(options.channelId);
    this.writeToken = requireWriteToken(options.writeToken);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') {
      throw new RelayConfigurationError('This device does not provide fetch for relay sync.');
    }
  }

  async pull(slot: RelaySlot): Promise<RelayBlob | null> {
    const response = await this.fetchImpl(this.slotUrl(slot), {
      method: 'GET',
      cache: 'no-store',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw httpError('pull', response);

    const generation = response.headers.get('ETag');
    if (!generation || generation.trim() === '') {
      throw new RelayProtocolError('The relay response did not include a generation.', 'pull');
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      generation,
    };
  }

  async push(slot: RelaySlot, bytes: Uint8Array, ifMatch: string): Promise<RelayPushResult> {
    const generation = requireGeneration(ifMatch);
    const response = await this.fetchImpl(this.slotUrl(slot), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.writeToken}`,
        'Content-Type': 'application/octet-stream',
        'If-Match': generation,
      },
      // Blob is accepted by browser fetch and lets the user agent provide the
      // Content-Length header required by the relay without setting a forbidden
      // request header from application code.
      body: new Blob([toArrayBuffer(bytes)], { type: 'application/octet-stream' }),
    });
    if (response.status === 412) throw new StaleGenerationError(generation);
    if (!response.ok) throw httpError('push', response);

    const nextGeneration = response.headers.get('ETag');
    if (!nextGeneration || nextGeneration.trim() === '') {
      throw new RelayProtocolError('The relay response did not include a generation.', 'push');
    }
    return { generation: nextGeneration };
  }

  async purge(): Promise<void> {
    const response = await this.fetchImpl(this.channelUrl(), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.writeToken}` },
    });
    // Purge is idempotent: a channel already gone is in the desired state.
    if (response.status === 404) return;
    if (!response.ok) throw httpError('purge', response);
  }

  private slotUrl(slot: RelaySlot): string {
    return `${this.channelUrl()}/${slot}`;
  }

  private channelUrl(): string {
    return `${this.relayUrl}/c/${this.channelId}`;
  }
}

function normaliseRelayUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RelayConfigurationError('The relay URL is invalid.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new RelayConfigurationError('The relay URL must use HTTP or HTTPS.');
  }
  if (url.search || url.hash) {
    throw new RelayConfigurationError('The relay URL must not contain a query or fragment.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

function requireChannelId(value: string): string {
  if (!/^[0-9a-f]{32}$/.test(value)) {
    throw new RelayConfigurationError('The sync channel id is invalid.');
  }
  return value;
}

function requireWriteToken(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new RelayConfigurationError('The sync write token is invalid.');
  }
  return value;
}

function requireGeneration(value: string): string {
  if (value.trim() === '') {
    throw new RelayProtocolError('The sync generation is empty.', 'push');
  }
  return value;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function httpError(operation: RelayOperation, response: Response): RelayHttpError {
  const detail = response.status === 413 ? ' The sync payload is too large for the relay.' : '';
  return new RelayHttpError(
    `Relay ${operation} failed with HTTP ${response.status}.${detail}`,
    operation,
    response.status,
  );
}
