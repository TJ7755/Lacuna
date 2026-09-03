import { updateSyncState } from '../db/mutationStamp';
import type { SyncState } from '../db/types';
import { normaliseRelayUrl } from './relay';

const CHANNEL_KEY_HEX_RE = /^[0-9a-f]{64}$/;
const WRITE_TOKEN_RE = /^[0-9a-f]{64}$/;

export interface SyncCredentials {
  relayUrl: string;
  channelId: string;
  channelKey: Uint8Array;
  writeToken: string;
}

/**
 * Build credentials from this device's remembered copy without loading the
 * cryptographic pairing and sync pipeline.
 */
export function readRememberedCredentials(state: SyncState | undefined): SyncCredentials | null {
  if (!state?.remembered || !state.channelId) return null;
  if (!CHANNEL_KEY_HEX_RE.test(state.remembered.channelKeyHex)) return null;
  if (!WRITE_TOKEN_RE.test(state.remembered.writeToken)) return null;
  if (!state.relayUrl) return null;
  try {
    const channelKey = new Uint8Array(state.remembered.channelKeyHex.length / 2);
    for (let index = 0; index < channelKey.length; index += 1) {
      channelKey[index] = Number.parseInt(
        state.remembered.channelKeyHex.slice(index * 2, index * 2 + 2),
        16,
      );
    }
    return {
      relayUrl: normaliseRelayUrl(state.relayUrl),
      channelId: state.channelId,
      channelKey,
      writeToken: state.remembered.writeToken,
    };
  } catch {
    return null;
  }
}

/** Clear this device's remembered copy, keeping the wrapped recovery keybag. */
export async function forgetRememberedCredentials(): Promise<void> {
  await updateSyncState((current) => {
    if (!current?.remembered) return undefined;
    const { remembered: _omitted, ...rest } = current;
    return rest;
  });
}
