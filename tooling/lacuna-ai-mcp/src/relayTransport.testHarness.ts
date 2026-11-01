import { Buffer } from 'node:buffer';
import { vi } from 'vitest';
import type { JsonValue } from '../../../apps/web/src/ai/protocol';
import type { RelayEnvelope } from '../../../apps/web/src/ai/relayProtocol';
import {
  HttpTerminalRelayTransport,
  type HttpTerminalRelayTransportOptions,
  type RelayCryptoOperations,
} from './relayTransport';

export const PUBLIC_KEY = Buffer.from(new Uint8Array(65).fill(1)).toString('base64url');

export const PEER_PUBLIC_KEY = Buffer.from(new Uint8Array(65).fill(2)).toString('base64url');

export const TOKEN = 'a'.repeat(64);

export const ENVELOPE: RelayEnvelope = {
  version: 1,
  nonce: Buffer.from(new Uint8Array(12)).toString('base64url'),
  ciphertext: Buffer.from(new Uint8Array(16)).toString('base64url'),
};

export const ENCRYPTED_BODY_SHA256 =
  'ee9696c083aaba5cbe3a1be2c7001dff4b5f7bb80a91b62dcf8f8ad39e97c045';

export const SYNTHETIC_GENERATION = `"sha256:${ENCRYPTED_BODY_SHA256}"`;

export const KEY = {} as CryptoKey;

export function cryptoOperations(opened: JsonValue): RelayCryptoOperations {
  return {
    createKeyPair: vi.fn().mockResolvedValue({ publicKey: PUBLIC_KEY, privateKey: 'private-key' }),
    deriveKey: vi.fn().mockResolvedValue(KEY),
    seal: vi.fn().mockResolvedValue(ENVELOPE),
    open: vi.fn().mockResolvedValue(opened),
  };
}

export function createTestTerminalRelayTransport(
  options: HttpTerminalRelayTransportOptions,
): HttpTerminalRelayTransport {
  return new HttpTerminalRelayTransport({
    ...options,
    recovery: {
      ...options.recovery,
      wait: options.recovery?.wait ?? (async () => {}),
    },
  });
}
