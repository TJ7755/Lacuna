export interface SyncFeedback {
  message: string;
  field?: string;
}

/** Associate known pairing failures with the value the learner can correct. */
export function syncFeedback(error: unknown, fallback: string, prefix: string): SyncFeedback {
  const message = error instanceof Error ? error.message : fallback;
  if (/passphrase/i.test(message)) return { message, field: `${prefix}-passphrase` };
  if (/channel id|channel not found|keybag.*404/i.test(message))
    return { message, field: 'sync-join-channel' };
  if (/relay URL/i.test(message)) return { message, field: `${prefix}-relay` };
  if (/mint secret/i.test(message)) return { message, field: 'sync-mint-secret' };
  return { message };
}

export function focusSyncField(field: string | undefined) {
  if (field) document.getElementById(field)?.focus();
}
