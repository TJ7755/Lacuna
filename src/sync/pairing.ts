// P6 pairing helpers. The UI owns when secrets are shown or requested; this module
// owns validation, relay minting, keybag handling and the common sync hand-off.

import {
  clearSyncState,
  readSyncState,
  updateSyncState,
  writeSyncState,
} from '../db/mutationStamp';
import type { RememberedSyncCredentials, SyncState } from '../db/types';
import { SyncCryptoPassphraseError, generateChannelKey, unwrapKeybag, wrapKeybag } from './crypto';
import { syncCycle, type SyncResult } from './cycle';
import {
  EMPTY_GENERATION,
  HttpRelayProvider,
  bindFetch,
  normaliseRelayUrl,
  pullRelaySlot,
  type RelayProvider,
} from './relay';
import {
  DEFAULT_RELAY_URL,
  MIN_RECOVERY_PASSPHRASE_LENGTH,
  validateRecoveryPassphrase,
} from './pairingConfig';
import {
  forgetRememberedCredentials,
  readRememberedCredentials,
  type SyncCredentials,
} from './credentials';

export { DEFAULT_RELAY_URL, MIN_RECOVERY_PASSPHRASE_LENGTH, validateRecoveryPassphrase };
export { forgetRememberedCredentials, readRememberedCredentials };
export type { SyncCredentials };
export const PAIRING_CODE_PREFIX = 'LACUNA-SYNC-1:';

const CHANNEL_ID_RE = /^[0-9a-f]{32}$/;
const WRITE_TOKEN_RE = /^[0-9a-f]{64}$/;
const CHANNEL_KEY_HEX_RE = /^[0-9a-f]{64}$/;

export class SyncPairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncPairingError';
  }
}

export interface PairingPayload {
  version: 1;
  relayUrl: string;
  channelId: string;
  writeToken: string;
  channelKeyHex: string;
}

export interface PairingSession {
  credentials: SyncCredentials;
  pairingCode: string;
  result: SyncResult;
  state: SyncState;
}

export interface PairingOperationOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface MintedChannel {
  channelId: string;
  writeToken: string;
}

/** Encode the complete pairing capability for an explicit QR reveal. */
export function encodePairingCode(credentials: SyncCredentials): string {
  const payload: PairingPayload = {
    version: 1,
    relayUrl: normaliseRelayUrl(credentials.relayUrl),
    channelId: requireChannelId(credentials.channelId),
    writeToken: requireWriteToken(credentials.writeToken),
    channelKeyHex: bytesToHex(credentials.channelKey),
  };
  return `${PAIRING_CODE_PREFIX}${base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))}`;
}

/** Decode and validate a scanned pairing QR without contacting the relay. */
export function decodePairingCode(value: string): PairingPayload {
  const raw = value.trim();
  if (!raw.startsWith(PAIRING_CODE_PREFIX)) {
    throw new SyncPairingError('This is not a Lacuna sync QR code.');
  }

  let parsed: unknown;
  try {
    const encoded = raw.slice(PAIRING_CODE_PREFIX.length);
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64UrlDecode(encoded)));
  } catch {
    throw new SyncPairingError('This sync QR code is unreadable.');
  }
  if (!isPairingPayload(parsed)) throw new SyncPairingError('This sync QR code is invalid.');
  return parsed;
}

/** Set up the first device: mint, publish the keybag, then push local state. */
export async function setupFirstDevice(
  relayUrl: string,
  mintSecret: string,
  passphrase: string,
  options: PairingOperationOptions = {},
): Promise<PairingSession> {
  const url = requireRelayUrl(relayUrl);
  requirePassphrase(passphrase);

  const minted = await mintChannel(url, mintSecret, options.fetchImpl);
  const credentials: SyncCredentials = {
    relayUrl: url,
    channelId: minted.channelId,
    channelKey: generateChannelKey(),
    writeToken: minted.writeToken,
  };
  const keybag = await wrapKeybag(credentials.channelKey, passphrase, credentials.writeToken, {
    channelId: credentials.channelId,
  });
  const provider = createProvider(credentials, options.fetchImpl);
  await provider.push('keybag', keybag, EMPTY_GENERATION);
  await persistPairing(credentials, keybag);
  const result = await runWithCredentials(credentials, options.now, options.fetchImpl);
  return session(credentials, result);
}

/** Join from a QR payload; the local passphrase protects this device's recovery copy. */
export async function joinFromPairingCode(
  payload: PairingPayload,
  passphrase: string,
  options: PairingOperationOptions = {},
): Promise<PairingSession> {
  if (!isPairingPayload(payload)) throw new SyncPairingError('This sync QR code is invalid.');
  requirePassphrase(passphrase);
  const credentials = credentialsFromPayload(payload);
  const keybag = await wrapKeybag(credentials.channelKey, passphrase, credentials.writeToken, {
    channelId: credentials.channelId,
  });
  await persistPairing(credentials, keybag);
  const result = await runWithCredentials(credentials, options.now, options.fetchImpl);
  return session(credentials, result);
}

/** Join by retrieving the relay keybag and opening it with the recovery passphrase. */
export async function joinWithPassphrase(
  relayUrl: string,
  channelId: string,
  passphrase: string,
  options: PairingOperationOptions = {},
): Promise<PairingSession> {
  const url = requireRelayUrl(relayUrl);
  const id = requireChannelId(channelId);
  requirePassphrase(passphrase);
  const keybag = await pullRelaySlot(url, id, 'keybag', options.fetchImpl);
  if (!keybag) {
    throw new SyncPairingError(
      'This channel has no recovery key. Check the relay URL and channel id.',
    );
  }

  let opened: { channelKey: Uint8Array; writeToken: string };
  try {
    opened = await unwrapKeybag(keybag.bytes, passphrase, { channelId: id });
  } catch (error) {
    if (error instanceof SyncCryptoPassphraseError) {
      throw new SyncPairingError('That recovery passphrase was not accepted.');
    }
    throw error;
  }

  const credentials: SyncCredentials = {
    relayUrl: url,
    channelId: id,
    channelKey: opened.channelKey,
    writeToken: opened.writeToken,
  };
  await persistPairing(credentials, keybag.bytes);
  const result = await runWithCredentials(credentials, options.now, options.fetchImpl);
  return session(credentials, result);
}

/** Unlock the locally stored keybag and run a deliberate manual sync. */
export async function syncWithPassphrase(
  state: SyncState,
  passphrase: string,
  options: PairingOperationOptions = {},
): Promise<PairingSession> {
  const credentials = await unlockSyncState(state, passphrase);
  const result = await runWithCredentials(credentials, options.now, options.fetchImpl);
  return session(credentials, result);
}

/** Run a sync with already-unlocked credentials (no passphrase prompt). */
export async function syncWithCredentials(
  credentials: SyncCredentials,
  options: PairingOperationOptions = {},
): Promise<PairingSession> {
  const result = await runWithCredentials(credentials, options.now, options.fetchImpl);
  return session(credentials, result);
}

/** Open the locally stored keybag without running a sync, for destructive actions. */
export async function unlockSyncState(
  state: SyncState,
  passphrase: string,
): Promise<SyncCredentials> {
  const url = requireRelayUrl(state.relayUrl);
  const id = requireChannelId(state.channelId);
  requirePassphrase(passphrase);
  if (!state.wrappedKeyMaterial) {
    throw new SyncPairingError('This device has no local recovery key. Pair it again.');
  }

  try {
    const opened = await unwrapKeybag(hexToBytes(state.wrappedKeyMaterial), passphrase, {
      channelId: id,
    });
    const credentials: SyncCredentials = { relayUrl: url, channelId: id, ...opened };
    await rememberCredentials(credentials);
    return credentials;
  } catch (error) {
    if (error instanceof SyncCryptoPassphraseError) {
      throw new SyncPairingError('That recovery passphrase was not accepted.');
    }
    throw error;
  }
}

async function rememberCredentials(credentials: SyncCredentials): Promise<void> {
  await updateSyncState((current) =>
    current
      ? {
          ...current,
          remembered: serialiseRememberedCredentials(credentials),
        }
      : current,
  );
}

export async function unpair(): Promise<void> {
  await clearSyncState();
}

/** Purge the shared relay channel, then clear only this device's local pairing. */
export async function deleteChannel(
  state: SyncState,
  passphraseOrCredentials: string | SyncCredentials,
  options: PairingOperationOptions = {},
): Promise<void> {
  const credentials =
    typeof passphraseOrCredentials === 'string'
      ? await unlockSyncState(state, passphraseOrCredentials)
      : passphraseOrCredentials;
  const stateRelayUrl = state.relayUrl ? normaliseRelayUrl(state.relayUrl) : null;
  if (
    !state.channelId ||
    !stateRelayUrl ||
    credentials.channelId !== state.channelId ||
    credentials.relayUrl !== stateRelayUrl
  ) {
    throw new SyncPairingError('This device is no longer unlocked for that sync channel.');
  }
  await createProvider(credentials, options.fetchImpl).purge();
  await clearSyncState();
}

async function mintChannel(
  relayUrl: string,
  mintSecret: string,
  fetchImpl?: typeof fetch,
): Promise<MintedChannel> {
  const fetcher = fetchImpl ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
    throw new SyncPairingError('This device does not provide network access for sync setup.');
  }
  const trimmedSecret = mintSecret.trim();
  const headers: Record<string, string> = {};
  if (trimmedSecret !== '') headers.Authorization = `Bearer ${trimmedSecret}`;
  const response = await bindFetch(fetcher)(`${relayUrl}/channel`, {
    method: 'POST',
    headers,
  });
  if (response.status === 401) throw new SyncPairingError('The relay mint secret was rejected.');
  if (response.status === 429)
    throw new SyncPairingError('Too many sync channels created recently. Try again later.');
  if (response.status === 503) {
    throw new SyncPairingError('Channel creation is not available on this relay.');
  }
  if (!response.ok)
    throw new SyncPairingError(`Could not create a sync channel (HTTP ${response.status}).`);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SyncPairingError('The relay returned an invalid channel response.');
  }
  if (!isMintedChannel(body))
    throw new SyncPairingError('The relay returned an invalid channel response.');
  return body;
}

async function persistPairing(credentials: SyncCredentials, keybag: Uint8Array): Promise<void> {
  await writeSyncState({
    relayUrl: credentials.relayUrl,
    channelId: credentials.channelId,
    wrappedKeyMaterial: bytesToHex(keybag),
    remembered: serialiseRememberedCredentials(credentials),
    lastError: null,
  });
}

function serialiseRememberedCredentials(credentials: SyncCredentials): RememberedSyncCredentials {
  return {
    channelKeyHex: bytesToHex(credentials.channelKey),
    writeToken: credentials.writeToken,
  };
}

async function runWithCredentials(
  credentials: SyncCredentials,
  now?: () => number,
  fetchImpl?: typeof fetch,
): Promise<SyncResult> {
  return syncCycle({
    provider: createProvider(credentials, fetchImpl),
    channelId: credentials.channelId,
    channelKey: credentials.channelKey,
    now,
  });
}

function createProvider(credentials: SyncCredentials, fetchImpl?: typeof fetch): RelayProvider {
  return new HttpRelayProvider({
    relayUrl: credentials.relayUrl,
    channelId: credentials.channelId,
    writeToken: credentials.writeToken,
    fetchImpl,
  });
}

function session(credentials: SyncCredentials, result: SyncResult): Promise<PairingSession> {
  return readSyncState().then((state) => {
    if (!state) throw new SyncPairingError('Sync state was not saved.');
    return {
      credentials,
      pairingCode: encodePairingCode(credentials),
      result,
      state,
    };
  });
}

function credentialsFromPayload(payload: PairingPayload): SyncCredentials {
  return {
    relayUrl: normaliseRelayUrl(payload.relayUrl),
    channelId: payload.channelId,
    channelKey: hexToBytes(payload.channelKeyHex),
    writeToken: payload.writeToken,
  };
}

function requireRelayUrl(value: string | undefined): string {
  if (!value || value.trim() === '') throw new SyncPairingError('Enter a relay URL.');
  try {
    return normaliseRelayUrl(value.trim());
  } catch {
    throw new SyncPairingError('Enter a valid HTTP or HTTPS relay URL.');
  }
}

function requirePassphrase(value: string): void {
  const error = validateRecoveryPassphrase(value);
  if (error) throw new SyncPairingError(error);
}

function requireChannelId(value: string | undefined): string {
  if (!value || !CHANNEL_ID_RE.test(value))
    throw new SyncPairingError('The sync channel id is invalid.');
  return value;
}

function requireWriteToken(value: string): string {
  if (!WRITE_TOKEN_RE.test(value)) throw new SyncPairingError('The sync write token is invalid.');
  return value;
}

function isMintedChannel(value: unknown): value is MintedChannel {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.channelId === 'string' &&
    CHANNEL_ID_RE.test(body.channelId) &&
    typeof body.writeToken === 'string' &&
    WRITE_TOKEN_RE.test(body.writeToken)
  );
}

function isPairingPayload(value: unknown): value is PairingPayload {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  if (body.version !== 1 || typeof body.relayUrl !== 'string' || typeof body.channelId !== 'string')
    return false;
  if (typeof body.writeToken !== 'string' || typeof body.channelKeyHex !== 'string') return false;
  if (!CHANNEL_ID_RE.test(body.channelId) || !WRITE_TOKEN_RE.test(body.writeToken)) return false;
  if (!CHANNEL_KEY_HEX_RE.test(body.channelKeyHex)) return false;
  try {
    normaliseRelayUrl(body.relayUrl);
    return true;
  } catch {
    return false;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array {
  if (!CHANNEL_KEY_HEX_RE.test(value) && !/^[0-9a-f]+$/.test(value)) {
    throw new SyncPairingError('The stored sync key is invalid.');
  }
  if (value.length % 2 !== 0) throw new SyncPairingError('The stored sync key is invalid.');
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url.');
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
