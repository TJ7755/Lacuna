/**
 * Marks an explicit entry from the prerendered landing page into the study app.
 * The application shell boots after the landing handover, so its first-run
 * redirect must honour the visitor's choice instead of bouncing them back to
 * the welcome route. Kept free of imports so both the landing entry and the
 * app bootstrap can use it without dragging in extra modules.
 */
const HANDOVER_KEY = 'lacuna.landingHandover';

export function markLandingHandover(): void {
  try {
    sessionStorage.setItem(HANDOVER_KEY, '1');
  } catch {
    // Best-effort; without storage the app falls back to the welcome route.
  }
}

/** One-shot check for the handover flag set when leaving the landing page. */
export function consumeLandingHandover(): boolean {
  try {
    if (sessionStorage.getItem(HANDOVER_KEY) === '1') {
      sessionStorage.removeItem(HANDOVER_KEY);
      return true;
    }
  } catch {
    // Storage may be unavailable; treat the start as an ordinary launch.
  }
  return false;
}
