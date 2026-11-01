/**
 * Assign the theme-aware palette by active course ID order, independently of display
 * order, names or forecasts. The first six courses are distinct; only later courses
 * cycle. Adding or archiving a course can change ranks. Stored legacy/import colours
 * remain untouched because they do not guarantee contrast in both themes.
 */
export function courseColours(courseIds: readonly string[]): Map<string, string> {
  return new Map(
    [...new Set(courseIds)].sort().map((id, rank) => {
      const slot = rank % 6;
      return [id, slot === 0 ? 'hsl(var(--accent-ink))' : `hsl(var(--series-${slot}))`];
    }),
  );
}
