// P7 automatic triggers — pull on focus and push after a study session ends.
// The triggers share the in-session unlock so automatic sync does not re-ask the
// passphrase. `SyncSection` publishes the unlocked credentials here after a
// successful manual sync or QR reveal; the triggers consume them.

import { readSyncState } from '../db/mutationStamp';
import { syncWithCredentials, type SyncCredentials } from './pairing';

let currentCredentials: SyncCredentials | null = null;
let installed = false;
let debounceTimer: number | null = null;
let lastTriggerAt = 0;

const DEBOUNCE_MS = 1500;
const MIN_INTERVAL_MS = 5000;

export function publishUnlockedCredentials(credentials: SyncCredentials | null): void {
  currentCredentials = credentials;
}

export function getUnlockedCredentials(): SyncCredentials | null {
  return currentCredentials;
}

export function clearUnlockedCredentials(): void {
  currentCredentials = null;
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
  installed = false;
  lastTriggerAt = 0;
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
