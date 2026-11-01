import { speedMultiplier } from '../../state/motionSpeed';

// Text-entry controls only; choices such as checkboxes and sliders have their own states.
const TYPEABLE =
  'textarea, [contenteditable=""], [contenteditable="true"], ' +
  'input:not([type]), input[type="text"], input[type="search"], input[type="email"], ' +
  'input[type="url"], input[type="tel"], input[type="password"], input[type="number"]';

const GLOW = '0 0 0 3px hsl(var(--accent) / 0.28)';
const GLOW_GONE = '0 0 0 3px hsl(var(--accent) / 0)';

/**
 * Acknowledge typing with a soft accent glow around the focused field that fades back
 * to its resting style. Only the box shadow animates, so text, caret and layout never
 * move. The glow is layered over the field's own shadows, so its focus ring holds steady
 * underneath rather than being replaced while the glow runs. A burst of typing shares
 * one glow rather than stacking a glow per keystroke, and it follows the motion-speed
 * setting (none when motion is off).
 */
export function installTypingFeedback(root: Document = document): () => void {
  const glowing = new WeakMap<Element, Animation>();

  const onInput = (event: Event) => {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>(TYPEABLE) : null;
    if (!target || target.hasAttribute('data-no-typing-feedback')) return;
    const multiplier = speedMultiplier();
    if (multiplier <= 0 || typeof target.animate !== 'function') return;
    const current = glowing.get(target);
    if (current && current.playState === 'running') return;
    const resting = getComputedStyle(target).boxShadow;
    const under = resting && resting !== 'none' ? `, ${resting}` : '';
    glowing.set(
      target,
      target.animate([{ boxShadow: GLOW + under }, { boxShadow: GLOW_GONE + under }], {
        duration: 420 * multiplier,
        easing: 'ease-out',
      }),
    );
  };

  root.addEventListener('input', onInput, true);
  return () => root.removeEventListener('input', onInput, true);
}
