/**
 * Tag utilities.
 *
 * `normaliseTagName` is the single source of truth for tag name normalisation.
 * All tag reads and writes must pass names through this function before any
 * comparison or persistence.
 */

/** Normalises a tag name: trims whitespace and lowercases. */
export function normaliseTagName(name: string): string {
  return name.trim().toLowerCase();
}
