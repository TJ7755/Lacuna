import { speedMultiplier } from '../../state/motionSpeed';

// Text-entry controls only; choices such as checkboxes and sliders have their own states.
const TYPEABLE =
  'textarea, [contenteditable=""], [contenteditable="true"], ' +
  'input:not([type]), input[type="text"], input[type="search"], input[type="email"], ' +
  'input[type="url"], input[type="tel"], input[type="password"], input[type="number"]';

/**
 * Acknowledge typing with a soft accent glow around the focused field that fades back
 * to its resting style. Only the box shadow animates, so text, caret and layout never
 * move. A burst of typing shares one glow rather than stacking a glow per keystroke,
 * and it follows the motion-speed setting (none when motion is off).
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
    glowing.set(
      target,
      target.animate([{ boxShadow: '0 0 0 3px hsl(var(--accent) / 0.28)' }], {
        duration: 420 * multiplier,
        easing: 'ease-out',
      }),
    );
  };

  root.addEventListener('input', onInput, true);
  return () => root.removeEventListener('input', onInput, true);
}
