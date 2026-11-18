export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const entry = record[key];
    if (entry !== undefined) sorted[key] = sortKeys(entry);
  }
  return sorted;
}

export function sortById<T extends { id: string }>(rows: T[]): T[] {
  return sortBy(rows, (row) => row.id);
}

export function sortBy<T>(rows: T[], keyOf: (row: T) => string): T[] {
  return [...rows].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}
