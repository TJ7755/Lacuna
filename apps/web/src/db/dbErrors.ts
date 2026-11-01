/** Convert low-level IndexedDB errors into user-facing persistence messages. */
export function friendlyDbError(error: unknown): Error {
  // Dexie re-wraps IndexedDB failures inside transactions as DexieError, keeping the name.
  if (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === 'QuotaExceededError'
  ) {
    return new Error('Your browser storage is full. Free up space or export your data to a file.');
  }
  if (error instanceof Error) return error;
  return new Error(String(error));
}
