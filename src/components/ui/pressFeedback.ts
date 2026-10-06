import { speedMultiplier } from '../../state/motionSpeed';

// Controls that animate their own press (the shared Button) opt out with data-press.
const PRESSABLE =
  'button:not(:disabled), a[href], [role="button"], [role="link"], ' +
  '[role="menuitem"], [role="tab"], [role="option"], [role="switch"], summary';

/** Sink about 5px whatever the size, so a card dips as gently as a pill. */
export function pressDepth(element: Element): number {
  const { width, height } = element.getBoundingClientRect();
  const size = Math.max(width, height);
  if (size <= 0) return 0.96;
  return Math.min(0.995, Math.max(0.96, 1 - 5 / size));
}

/**
 * Give every control a brief press-in and spring-back, so each tap or click is
 * acknowledged. It animates the standalone `scale` property, which composes
 * with any transform a control already carries, and follows the motion-speed
 * setting (none when motion is off).
 */
export function installPressFeedback(root: Document = document): () => void {
  let pressed: { element: HTMLElement; animation: Animation; depth: number } | null = null;

  const release = () => {
    if (!pressed) return;
    const { element, animation, depth } = pressed;
    pressed = null;
    const multiplier = speedMultiplier();
    animation.cancel();
    if (multiplier <= 0 || typeof element.animate !== 'function') return;
    element.animate(
      [{ scale: `${depth}` }, { scale: `${2 - depth}`, offset: 0.55 }, { scale: '1' }],
      {
        duration: 260 * multiplier,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    );
  };

  const press = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>(PRESSABLE) : null;
    if (
      !target ||
      target.hasAttribute('data-press') ||
      target.closest('[inert]') ||
      target.getAttribute('aria-disabled') === 'true'
    )
      return;
    const multiplier = speedMultiplier();
    if (multiplier <= 0 || typeof target.animate !== 'function') return;
    release();
    const depth = pressDepth(target);
    pressed = {
      element: target,
      depth,
      animation: target.animate([{ scale: '1' }, { scale: `${depth}` }], {
        duration: 90 * multiplier,
        easing: 'ease-out',
        fill: 'forwards',
      }),
    };
  };

  // Keyboard and assistive-technology activation produces a click without a pointer.
  // Include the shared Button here: its pointer gesture is handled by Motion.
  const activate = (event: MouseEvent) => {
    if (event.detail !== 0) return;
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>(PRESSABLE) : null;
    const multiplier = speedMultiplier();
    if (
      !target ||
      target.closest('[inert]') ||
      target.getAttribute('aria-disabled') === 'true' ||
      multiplier <= 0 ||
      typeof target.animate !== 'function'
    )
      return;
    const depth = pressDepth(target);
    target.animate([{ scale: '1' }, { scale: `${depth}`, offset: 0.3 }, { scale: '1' }], {
      duration: 260 * multiplier,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  };

  root.addEventListener('click', activate, true);
  root.addEventListener('pointerdown', press, true);
  root.addEventListener('pointerup', release, true);
  root.addEventListener('pointercancel', release, true);
  root.addEventListener('dragstart', release, true);
  return () => {
    pressed?.animation.cancel();
    pressed = null;
    root.removeEventListener('click', activate, true);
    root.removeEventListener('pointerdown', press, true);
    root.removeEventListener('pointerup', release, true);
    root.removeEventListener('pointercancel', release, true);
    root.removeEventListener('dragstart', release, true);
  };
}
