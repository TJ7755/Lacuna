/**
 * Relative duration formatting utilities.
 *
 * Used for the rating button preview labels during review sessions.
 * All output uses British English conventions.
 */

/**
 * Formats a future Date as a human-readable relative duration from now.
 *
 * Thresholds:
 *   < 24 hours  →  '< 1 day'
 *   1–6 days    →  'N day(s)'
 *   7–13 days   →  '1 week'
 *   14–27 days  →  'N weeks'
 *   28+ days    →  'N month(s)'
 */
export function formatRelativeDuration(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) {
    return '< 1 day';
  }

  if (diffDays < 7) {
    const days = Math.round(diffDays);
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  if (diffDays < 14) {
    return '1 week';
  }

  if (diffDays < 28) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} weeks`;
  }

  const months = Math.max(1, Math.round(diffDays / 30));
  return `${months} month${months === 1 ? '' : 's'}`;
}
