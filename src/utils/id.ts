/** Generate a stable, collision-resistant identifier without external dependencies. */
export function makeId(): string {
  if (typeof crypto !== 'undefined') {
    try {
      return crypto.randomUUID();
    } catch {
      // randomUUID is unavailable in this runtime.
    }
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // UUID v4: version nibble = 4, variant bits = 10.
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      // getRandomValues is unavailable in this runtime.
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
