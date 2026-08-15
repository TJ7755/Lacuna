import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CHANNEL_KEY_BYTES,
  FORMAT_VERSION,
  KDF_ID_PBKDF2_SHA256,
  PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS_MAX,
  PBKDF2_ITERATIONS_MIN,
  SyncCryptoCorruptError,
  SyncCryptoError,
  SyncCryptoPassphraseError,
  SyncCryptoVersionError,
  generateChannelKey,
  openState,
  sealState,
  unwrapKeybag,
  wrapKeybag,
} from './crypto';

const SLOW = 30_000;

const ctx = { channelId: '0123456789abcdef0123456789abcdef' };
const plaintext = new TextEncoder().encode('snapshot-bytes');
const passphrase = 'a real passphrase for tests';
const writeToken = 'bb'.repeat(32);
const otherChannel = { channelId: 'fedcba9876543210fedcba9876543210' };

let channelKey: Uint8Array;
let stateBlob: Uint8Array;
let keybagBlob: Uint8Array;

beforeAll(async () => {
  channelKey = generateChannelKey();
  stateBlob = await sealState(channelKey, plaintext, ctx);
  keybagBlob = await wrapKeybag(channelKey, passphrase, writeToken, ctx);
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function flipByte(blob: Uint8Array, index: number): Uint8Array {
  const copy = new Uint8Array(blob);
  copy[index] = (copy[index]! ^ 0xff) & 0xff;
  return copy;
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, false);
}

describe('generateChannelKey', () => {
  it('returns 32 distinct random bytes', () => {
    const first = generateChannelKey();
    const second = generateChannelKey();
    expect(first.byteLength).toBe(CHANNEL_KEY_BYTES);
    expect(second.byteLength).toBe(CHANNEL_KEY_BYTES);
    expect(first).not.toEqual(second);
  });
});

describe('sealState / openState', () => {
  it('round-trips caller-supplied bytes', async () => {
    const opened = await openState(channelKey, stateBlob, ctx);
    expect(opened).toEqual(plaintext);
  });

  it('produces a different blob on each seal of the same plaintext', async () => {
    const first = await sealState(channelKey, plaintext, ctx);
    const second = await sealState(channelKey, plaintext, ctx);
    expect(first).not.toEqual(second);
    expect(await openState(channelKey, first, ctx)).toEqual(plaintext);
    expect(await openState(channelKey, second, ctx)).toEqual(plaintext);
  });

  it('fails closed on a tampered ciphertext', async () => {
    const tampered = flipByte(stateBlob, stateBlob.byteLength - 1);
    await expect(openState(channelKey, tampered, ctx)).rejects.toBeInstanceOf(SyncCryptoCorruptError);
    await expect(openState(channelKey, tampered, ctx)).rejects.toMatchObject({ kind: 'corrupt' });
  });

  it('rejects a flipped version byte before decrypt', async () => {
    const flipped = flipByte(stateBlob, 0);
    expect(flipped[0]).not.toBe(FORMAT_VERSION);
    await expect(openState(channelKey, flipped, ctx)).rejects.toBeInstanceOf(SyncCryptoVersionError);
    await expect(openState(channelKey, flipped, ctx)).rejects.toMatchObject({ kind: 'version' });
  });

  it('fails closed when the channel id does not match', async () => {
    await expect(openState(channelKey, stateBlob, otherChannel)).rejects.toBeInstanceOf(
      SyncCryptoCorruptError,
    );
  });

  it('fails closed when a keybag blob is opened as state', async () => {
    await expect(openState(channelKey, keybagBlob, ctx)).rejects.toBeInstanceOf(SyncCryptoError);
  });

  it('rejects a short blob as corrupt', async () => {
    await expect(openState(channelKey, new Uint8Array([FORMAT_VERSION, 1, 2]), ctx)).rejects.toBeInstanceOf(
      SyncCryptoCorruptError,
    );
  });

  it('rejects a channel key of the wrong length', async () => {
    await expect(sealState(new Uint8Array(16), plaintext, ctx)).rejects.toBeInstanceOf(
      SyncCryptoCorruptError,
    );
  });
});

describe('wrapKeybag / unwrapKeybag', () => {
  it('round-trips the channel key and write token', async () => {
    const opened = await unwrapKeybag(keybagBlob, passphrase, ctx);
    expect(opened.channelKey).toEqual(channelKey);
    expect(opened.writeToken).toBe(writeToken);
  }, SLOW);

  it('yields the same key the QR path would have imported', async () => {
    const generated = generateChannelKey();
    const wrapped = await wrapKeybag(generated, passphrase, writeToken, ctx);
    const opened = await unwrapKeybag(wrapped, passphrase, ctx);
    expect(opened.channelKey).toEqual(generated);
  }, SLOW);

  it('rejects a wrong passphrase', async () => {
    const wrong = 'wrong-secret-passphrase-xyz';
    await expect(unwrapKeybag(keybagBlob, wrong, ctx)).rejects.toBeInstanceOf(SyncCryptoPassphraseError);
    try {
      await unwrapKeybag(keybagBlob, wrong, ctx);
      throw new Error('expected unwrap to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncCryptoPassphraseError);
      const message = (error as Error).message;
      expect(message).not.toContain(wrong);
      expect(message).not.toContain(passphrase);
      expect(message).not.toContain(writeToken);
      expect(message.toLowerCase()).not.toContain(bytesToHex(channelKey));
    }
  }, SLOW);

  it('fails closed on a tampered keybag ciphertext when confirmation is intact', async () => {
    const tampered = flipByte(keybagBlob, keybagBlob.byteLength - 1);
    await expect(unwrapKeybag(tampered, passphrase, ctx)).rejects.toBeInstanceOf(SyncCryptoCorruptError);
    await expect(unwrapKeybag(tampered, passphrase, ctx)).rejects.toMatchObject({ kind: 'corrupt' });
  }, SLOW);

  it('reports a tampered header as a wrong passphrase', async () => {
    const tamperedSalt = flipByte(keybagBlob, 6);
    await expect(unwrapKeybag(tamperedSalt, passphrase, ctx)).rejects.toBeInstanceOf(
      SyncCryptoPassphraseError,
    );
  }, SLOW);

  it('rejects a flipped version byte before decrypt', async () => {
    const flipped = flipByte(keybagBlob, 0);
    await expect(unwrapKeybag(flipped, passphrase, ctx)).rejects.toBeInstanceOf(SyncCryptoVersionError);
  });

  it('rejects an unknown KDF id as a version error', async () => {
    const flipped = flipByte(keybagBlob, 1);
    expect(flipped[1]).not.toBe(KDF_ID_PBKDF2_SHA256);
    await expect(unwrapKeybag(flipped, passphrase, ctx)).rejects.toBeInstanceOf(SyncCryptoVersionError);
  });

  it('fails closed when the channel id does not match', async () => {
    await expect(unwrapKeybag(keybagBlob, passphrase, otherChannel)).rejects.toBeInstanceOf(
      SyncCryptoCorruptError,
    );
  }, SLOW);

  it('fails closed when a state blob is unwrapped as a keybag', async () => {
    await expect(unwrapKeybag(stateBlob, passphrase, ctx)).rejects.toBeInstanceOf(SyncCryptoError);
  });

  it('rejects an empty passphrase on wrap and unwrap', async () => {
    await expect(wrapKeybag(channelKey, '', writeToken, ctx)).rejects.toBeInstanceOf(
      SyncCryptoPassphraseError,
    );
    await expect(unwrapKeybag(keybagBlob, '', ctx)).rejects.toBeInstanceOf(SyncCryptoPassphraseError);
    await expect(unwrapKeybag(new Uint8Array(), '', ctx)).rejects.toBeInstanceOf(
      SyncCryptoPassphraseError,
    );
  });

  it('treats NFC-equivalent passphrases as the same secret', async () => {
    const composed = 'caf\u00e9';
    const decomposed = 'cafe\u0301';
    expect(composed).not.toBe(decomposed);
    const wrapped = await wrapKeybag(channelKey, composed, writeToken, ctx);
    const opened = await unwrapKeybag(wrapped, decomposed, ctx);
    expect(opened.channelKey).toEqual(channelKey);
    expect(opened.writeToken).toBe(writeToken);
  }, SLOW);

  it('rejects an empty or overlong write token', async () => {
    await expect(wrapKeybag(channelKey, passphrase, '', ctx)).rejects.toBeInstanceOf(
      SyncCryptoCorruptError,
    );
    await expect(wrapKeybag(channelKey, passphrase, 'x'.repeat(257), ctx)).rejects.toBeInstanceOf(
      SyncCryptoCorruptError,
    );
  });

  it('rejects an iteration count below the unwrap floor or above the DoS cap', async () => {
    const tooLow = new Uint8Array(keybagBlob);
    writeUint32BE(tooLow, 2, PBKDF2_ITERATIONS_MIN - 1);
    await expect(unwrapKeybag(tooLow, passphrase, ctx)).rejects.toBeInstanceOf(SyncCryptoCorruptError);

    const tooHigh = new Uint8Array(keybagBlob);
    writeUint32BE(tooHigh, 2, PBKDF2_ITERATIONS_MAX + 1);
    await expect(unwrapKeybag(tooHigh, passphrase, ctx)).rejects.toBeInstanceOf(SyncCryptoCorruptError);
  });
});

describe('frozen v1 layout', () => {
  // Generated once against this module after the format was frozen. A later
  // silent change to AAD, KDF, confirmation, or field order must fail here.
  const channelId = '0123456789abcdef0123456789abcdef';
  const frozenKey = hexToBytes(
    '031425364758697a8b9cadbecfe0f102132435465768798a9bacbdcedff00112',
  );
  const frozenPassphrase = 'test passphrase for lacuna sync v1';
  const frozenToken = 'aa'.repeat(32);
  const frozenPlaintext = hexToBytes('68656c6c6f206c6163756e61207374617465');
  const wrapSalt = hexToBytes('a0a1a2a3a4a5a6a7a8a9aaabacadaeaf');
  const wrapNonce = hexToBytes('b0b1b2b3b4b5b6b7b8b9babb');
  const sealNonce = hexToBytes('c0c1c2c3c4c5c6c7c8c9cacb');
  const frozenState = hexToBytes(
    '01c0c1c2c3c4c5c6c7c8c9cacbc3f79571c7d2e1b3851df7e8f3335b2efac7aa11fcc9ae942998c50a1fcba564d17e',
  );
  const frozenKeybag = hexToBytes(
    '0101000927c0a0a1a2a3a4a5a6a7a8a9aaabacadaeafdbf37228f40172a16c006bed0020e94bb0b1b2b3b4b5b6b7b8b9babb5467af2fd63ea09ae81b8e23f6326d5a7a56a135c9e0a85bb2b2b8b2205f4b1d808c1d9af799fa7aec7c3ceab7f97c343acb3133fcb3c747d254d2db602b7bed0164ef15b0f73436850e3373e0685bbeb9d071a86c82734c232279a353f6b5c4e30301615391b0342ffa04511a367e47',
  );

  it('still opens the frozen blobs', async () => {
    expect(frozenKeybag[0]).toBe(FORMAT_VERSION);
    expect(frozenKeybag[1]).toBe(KDF_ID_PBKDF2_SHA256);
    expect(new DataView(frozenKeybag.buffer).getUint32(2, false)).toBe(PBKDF2_ITERATIONS);

    expect(await openState(frozenKey, frozenState, { channelId })).toEqual(frozenPlaintext);
    const opened = await unwrapKeybag(frozenKeybag, frozenPassphrase, { channelId });
    expect(opened.channelKey).toEqual(frozenKey);
    expect(opened.writeToken).toBe(frozenToken);
  }, SLOW);

  it('still emits the frozen blobs from the frozen random stream', async () => {
    const queue = [wrapSalt, wrapNonce, sealNonce];
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      if (array === null) throw new Error('getRandomValues(null)');
      const next = queue.shift();
      if (!next || next.byteLength !== array.byteLength) {
        throw new Error('unexpected getRandomValues length');
      }
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(next);
      return array;
    });

    const keybag = await wrapKeybag(frozenKey, frozenPassphrase, frozenToken, { channelId });
    const state = await sealState(frozenKey, frozenPlaintext, { channelId });
    expect(bytesToHex(keybag)).toBe(bytesToHex(frozenKeybag));
    expect(bytesToHex(state)).toBe(bytesToHex(frozenState));
  }, SLOW);
});
