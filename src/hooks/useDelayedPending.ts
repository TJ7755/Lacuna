import { useEffect, useState } from 'react';

/** Loading below this reads as instant; showing a placeholder for it only flashes. */
const DEFAULT_DELAY_MS = 250;

/**
 * Gates a loading placeholder so it never flashes. Returns true only once
 * `pending` has held continuously for `delayMs`.
 *
 * The loading owner may replace the placeholder as soon as its data resolves, so
 * minimum-visible timing cannot be enforced by a child component that is about to
 * unmount. Keeping this hook to the delay guarantee makes the lifecycle explicit.
 */
export function useDelayedPending(pending: boolean, delayMs = DEFAULT_DELAY_MS): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [pending, delayMs]);

  return visible;
}
