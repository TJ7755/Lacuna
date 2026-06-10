/**
 * Safe wrapper around navigator.vibrate for tactile feedback during gestures.
 * Falls back silently on devices that do not support the API.
 */
export function haptic(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore — vibration is a best-effort enhancement.
  }
}

/** Light tap for button presses, toggles, and small UI confirmations. */
export function hapticLight() {
  haptic(8);
}

/** Medium tap for committed actions (swipe-to-answer, tray open, grade). */
export function hapticMedium() {
  haptic(15);
}

/** Strong feedback for significant actions (delete, suspend, long-press trigger). */
export function hapticStrong() {
  haptic([20, 30, 20]);
}
