export const DEFAULT_RELAY_URL = 'https://relay.getlacuna.app';
export const MIN_RECOVERY_PASSPHRASE_LENGTH = 16;

/** Both default relay hosts reach the same channel store; preserve every other URL. */
export function migrateLegacyRelayUrl(relayUrl: string): string {
  return /^https:\/\/lacuna-relay\.vercel\.app\/*$/i.test(relayUrl) ? DEFAULT_RELAY_URL : relayUrl;
}

/** Return a user-facing validation message, or null when the passphrase is acceptable. */
export function validateRecoveryPassphrase(passphrase: string): string | null {
  if (passphrase.trim().length === 0) return 'Enter a recovery passphrase.';
  if (Array.from(passphrase).length < MIN_RECOVERY_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_RECOVERY_PASSPHRASE_LENGTH} characters for the recovery passphrase.`;
  }
  return null;
}
