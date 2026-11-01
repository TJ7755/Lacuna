/** Parse a comma-separated steps string like "1m, 10m" into a valid step array. */
export function parseSteps(input: string): string[] | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const stepPattern = /^\d+[dhm]$/;
  if (parts.every((p) => stepPattern.test(p))) return parts;
  // If some parts don't match, fall back to null so the caller can decide.
  return null;
}
