export const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDayLabel(ms: number): string {
  if (!Number.isFinite(ms)) throw new Error('Invalid reporting date.');
  return new Date(ms).toISOString().slice(0, 10);
}

export function isoDayStartMs(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid reporting day.');
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(ms) || isoDayLabel(ms) !== day) throw new Error('Invalid reporting day.');
  return ms;
}

export function completedIsoDayLabel(now: number): string {
  return isoDayLabel(isoDayStartMs(isoDayLabel(now)) - DAY_MS);
}
