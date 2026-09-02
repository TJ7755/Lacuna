export const DEFAULT_RELAY_URL = 'https://lacuna-relay.vercel.app';
export const MIN_RECOVERY_PASSPHRASE_LENGTH = 16;

/** Return a user-facing validation message, or null when the passphrase is acceptable. */
export function validateRecoveryPassphrase(passphrase: string): string | null {
  if (passphrase.trim().length === 0) return 'Enter a recovery passphrase.';
  if (Array.from(passphrase).length < MIN_RECOVERY_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_RECOVERY_PASSPHRASE_LENGTH} characters for the recovery passphrase.`;
  }
  return null;
}
