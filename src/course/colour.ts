/**
 * Course identity uses the existing theme-aware chart palette everywhere. Hash only the
 * ID, so renaming, sorting, filtering or changing a forecast cannot change its colour.
 * The finite palette can repeat; course names remain the primary identifier.
 * Stored `colour` strings are arbitrary legacy/import colours without theme contrast
 * guarantees, so these indicators use the shared readable palette instead.
 */
export function courseColour(courseId: string): string {
  let hash = 0;
  for (let i = 0; i < courseId.length; i++) {
    hash = (Math.imul(hash, 31) + courseId.charCodeAt(i)) >>> 0;
  }
  const index = hash % 6;
  return index === 0 ? 'hsl(var(--accent-ink))' : `hsl(var(--series-${index}))`;
}
