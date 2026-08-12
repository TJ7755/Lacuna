import { useEffect, useState } from 'react';

/** Loading below this reads as instant; showing a placeholder for it only flashes. */
const DEFAULT_DELAY_MS = 250;

/** Once a placeholder is on screen it stays for at least this long, so it cannot flash either. */
const DEFAULT_MIN_VISIBLE_MS = 300;

/**
 * Gates a loading placeholder so it never flashes. Returns true only once
 * `pending` has held continuously for `delayMs`, and then keeps returning true
 * for at least `minVisibleMs` so a placeholder that does appear is readable
 * rather than a blink.
 *
 * Route chunks are prefetched and warm navigations resolve in tens of
 * milliseconds, so most loads should render no placeholder at all; the
 * placeholder exists for cold chunk fetches and large courses.
 */
export function useDelayedPending(
  pending: boolean,
  delayMs = DEFAULT_DELAY_MS,
  minVisibleMs = DEFAULT_MIN_VISIBLE_MS,
): boolean {
  const [visible, setVisible] = useState(false);
  // True while the placeholder is inside its minimum lifetime and may not be withdrawn.
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => {
      setVisible(true);
      setHeld(true);
    }, delayMs);
    return () => window.clearTimeout(id);
  }, [pending, delayMs]);

  useEffect(() => {
    if (!held) return;
    const id = window.setTimeout(() => setHeld(false), minVisibleMs);
    return () => window.clearTimeout(id);
  }, [held, minVisibleMs]);

  useEffect(() => {
    if (!pending && !held) setVisible(false);
  }, [pending, held]);

  return visible;
}
