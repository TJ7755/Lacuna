// P7 automatic triggers — pull on focus and push after a study session ends.
// The triggers share the unlock so automatic sync does not re-ask the
// passphrase. `SyncSection` publishes the unlocked credentials here after a
// successful manual sync or QR reveal; this device's remembered copy restores
// them on install so a fresh page load syncs without prompting.

import { readSyncState } from '../db/mutationStamp';
import { allowRelayConnect } from './csp';
import type { SyncCredentials } from './pairing';

let currentCredentials: SyncCredentials | null = null;
let installed = false;
let debounceTimer: number | null = null;
let lastTriggerAt = 0;
let credentialGeneration = 0;

const DEBOUNCE_MS = 1500;
const MIN_INTERVAL_MS = 5000;

export function publishUnlockedCredentials(credentials: SyncCredentials | null): void {
  credentialGeneration += 1;
  currentCredentials = credentials;
}

export function getUnlockedCredentials(): SyncCredentials | null {
  return currentCredentials;
}

export function clearUnlockedCredentials(): void {
  publishUnlockedCredentials(null);
}

/** Publish this device's remembered credentials, if any. Called once per install. */
async function restoreRememberedCredentials(): Promise<void> {
  const generation = credentialGeneration;
  const state = await readSyncState().catch(() => null);
  if (!state?.remembered) return;
  const { readRememberedCredentials } = await import('./pairing');
  const credentials = readRememberedCredentials(state ?? undefined);
  if (!credentials || credentialGeneration !== generation) return;
  allowRelayConnect(credentials.relayUrl);
  publishUnlockedCredentials(credentials);
}

async function triggerSync(reason: string): Promise<void> {
  const now = Date.now();
  if (now - lastTriggerAt < MIN_INTERVAL_MS) return;
  const state = await readSyncState().catch(() => null);
  if (!state?.channelId || !state?.wrappedKeyMaterial) return;
  const credentials = currentCredentials;
  if (!credentials || credentials.channelId !== state.channelId) return;
  lastTriggerAt = now;
  try {
    const { syncWithCredentials } = await import('./pairing');
    await syncWithCredentials(credentials);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log(`[sync] auto ${reason} complete`);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[sync] auto ${reason} failed`, error);
    }
  }
}

function scheduleTrigger(reason: string): void {
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void triggerSync(reason);
  }, DEBOUNCE_MS);
}

export function installSyncTriggers(): () => void {
  if (installed) return () => {};
  installed = true;
  void restoreRememberedCredentials();

  const handleFocus = () => scheduleTrigger('focus');
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') scheduleTrigger('visible');
  };
  const handleStudyEnd = () => scheduleTrigger('study-end');

  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('lacuna:study-session-end', handleStudyEnd as EventListener);

  return () => {
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('lacuna:study-session-end', handleStudyEnd as EventListener);
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    installed = false;
  };
}

export function __resetTriggersForTests(): void {
  currentCredentials = null;
  credentialGeneration += 1;
  installed = false;
  lastTriggerAt = 0;
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
