import { describe, expect, it } from 'vitest';
import type { JsonValue } from './protocol';
import {
  RelayCryptoDecryptError,
  RelayCryptoFormatError,
  createRelayKeyPair,
  deriveRelayEncryptionKey,
  openRelayJson,
  sealRelayJson,
} from './relayCrypto';

describe('AI relay crypto', () => {
  it('persists reloadable P-256 keys and opens peer-sealed strict JSON', async () => {
    const browser = await createRelayKeyPair();
    const terminal = await createRelayKeyPair();
    expect(base64UrlDecode(browser.publicKey)).toHaveLength(65);
    expect(base64UrlDecode(browser.privateKey).byteLength).toBeGreaterThan(100);

    const browserKey = await deriveRelayEncryptionKey(browser.privateKey, terminal.publicKey);
    const terminalKey = await deriveRelayEncryptionKey(terminal.privateKey, browser.publicKey);
    const value: JsonValue = {
      version: 1,
      messages: [{ id: 'message-1', content: 'Explain spacing.' }],
    };

    await expect(openRelayJson(terminalKey, await sealRelayJson(browserKey, value))).resolves.toEqual(
      value,
    );
  });

  it('uses a fresh 12-byte nonce for every AES-GCM envelope', async () => {
    const browser = await createRelayKeyPair();
    const terminal = await createRelayKeyPair();
    const key = await deriveRelayEncryptionKey(browser.privateKey, terminal.publicKey);

    const first = await sealRelayJson(key, { value: 1 });
    const second = await sealRelayJson(key, { value: 1 });

    expect(base64UrlDecode(first.nonce)).toHaveLength(12);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('binds ciphertext to the frozen relay AAD', async () => {
    const browser = await createRelayKeyPair();
    const terminal = await createRelayKeyPair();
    const key = await deriveRelayEncryptionKey(browser.privateKey, terminal.publicKey);
    const envelope = await sealRelayJson(key, { answer: 42 });

    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(base64UrlDecode(envelope.nonce)),
        additionalData: toArrayBuffer(new TextEncoder().encode('lacuna-ai-relay-v1')),
        tagLength: 128,
      },
      key,
      toArrayBuffer(base64UrlDecode(envelope.ciphertext)),
    );

    expect(JSON.parse(new TextDecoder().decode(plaintext))).toEqual({ answer: 42 });
  });

  it('rejects non-JSON values before encryption', async () => {
    const browser = await createRelayKeyPair();
    const terminal = await createRelayKeyPair();
    const key = await deriveRelayEncryptionKey(browser.privateKey, terminal.publicKey);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    await expect(sealRelayJson(key, Number.NaN as unknown as JsonValue)).rejects.toBeInstanceOf(
      RelayCryptoFormatError,
    );
    await expect(sealRelayJson(key, cyclic as JsonValue)).rejects.toBeInstanceOf(
      RelayCryptoFormatError,
    );
  });

  it('fails closed for malformed, tampered or wrong-key envelopes', async () => {
    const browser = await createRelayKeyPair();
    const terminal = await createRelayKeyPair();
    const stranger = await createRelayKeyPair();
    const key = await deriveRelayEncryptionKey(browser.privateKey, terminal.publicKey);
    const wrongKey = await deriveRelayEncryptionKey(stranger.privateKey, terminal.publicKey);
    const envelope = await sealRelayJson(key, { value: true });
    const ciphertext = base64UrlDecode(envelope.ciphertext);
    ciphertext[ciphertext.length - 1]! ^= 1;

    await expect(
      openRelayJson(key, { ...envelope, unexpected: true }),
    ).rejects.toBeInstanceOf(RelayCryptoFormatError);
    await expect(
      openRelayJson(key, { ...envelope, ciphertext: base64UrlEncode(ciphertext) }),
    ).rejects.toBeInstanceOf(RelayCryptoDecryptError);
    await expect(openRelayJson(wrongKey, envelope)).rejects.toBeInstanceOf(
      RelayCryptoDecryptError,
    );
  });
});

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
