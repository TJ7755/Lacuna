import { animate, motionValue } from 'motion';
import { speedMultiplier } from '../../state/motionSpeed';
import { scaledSpring } from './motion';

const PRESSABLE =
  'button:not(:disabled), a[href], [role="button"], [role="link"], ' +
  '[role="menuitem"], [role="tab"], [role="option"], [role="switch"], summary, label:has(input[type="radio"]:not(:disabled))';

/** One owner for local feedback. Only the opaque decoration moves, never the control. */
export function installPressFeedback(root: Document = document): () => void {
  type Surface = ReturnType<typeof createSurface>;
  const surfaces = new WeakMap<HTMLElement, Surface>();
  const active = new Set<Surface>();
  let held: HTMLElement | null = null;
  let hovered: HTMLElement | null = null;

  function createSurface(element: HTMLElement) {
    const pressure = motionValue(0);
    const pull = motionValue(0);
    const style = element.style;
    const position = style.position;
    const update = () => {
      style.setProperty('--flow-pressure', String(pressure.get()));
      style.setProperty('--flow-pull', `${pull.get()}px`);
    };
    const unsubscribe = [pressure.on('change', update), pull.on('change', update)];
    const surface = {
      element,
      retarget(pressed: boolean, over: boolean, direction = 0) {
        pressed &&= element.dataset.flowFeedback !== 'hover';
        over &&= element.dataset.flowFeedback !== 'press';
        // Read the current theme/selection before transferring paint to the decoration.
        element.classList.remove('flow-feedback');
        const computed = getComputedStyle(element);
        const paint = element.hasAttribute('data-flow-trigger')
          ? element.closest('.flow-expansion')?.querySelector('[data-flow-trigger-paint]')
          : null;
        const fill = paint ? getComputedStyle(paint).fill : computed.backgroundColor;
        style.setProperty(
          '--flow-fill',
          fill === 'rgba(0, 0, 0, 0)' || fill === 'transparent'
            ? 'hsl(var(--surface-raised))'
            : fill,
        );
        style.setProperty('--flow-border', computed.borderColor);
        style.setProperty('--flow-border-width', computed.borderWidth);
        if (computed.position === 'static') style.position = 'relative';
        element.classList.add('flow-feedback');
        active.add(surface);
        const multiplier = speedMultiplier();
        const target = pressed ? 1 : over ? -0.45 : 0;
        const rest = () => {
          if (pressed || over) return;
          element.classList.remove('flow-feedback');
          style.position = position;
          active.delete(surface);
        };
        if (multiplier === 0) {
          pressure.jump(0);
          pull.jump(0);
          rest();
          return;
        }
        // Persistent values retain presented position and velocity on interruption.
        animate(pressure, target, { ...scaledSpring(multiplier, 580, 25), onComplete: rest });
        animate(pull, over ? direction : 0, scaledSpring(multiplier, 450, 27));
      },
      dispose() {
        pressure.stop();
        pull.stop();
        unsubscribe.forEach((stop) => stop());
        element.classList.remove('flow-feedback');
        style.position = position;
      },
      reset() {
        pressure.jump(0);
        pull.jump(0);
      },
    };
    return surface;
  }
  function target(event: Event) {
    const element =
      event.target instanceof Element ? event.target.closest<HTMLElement>(PRESSABLE) : null;
    return element &&
      !element.closest('[inert]') &&
      element.getAttribute('aria-disabled') !== 'true' &&
      (element.getAttribute('data-press') !== 'none' || element.hasAttribute('data-flow-feedback'))
      ? element
      : null;
  }
  function feedback(element: HTMLElement, pressed: boolean, over: boolean, direction = 0) {
    let surface = surfaces.get(element);
    if (!surface) {
      surface = createSurface(element);
      surfaces.set(element, surface);
    }
    surface.retarget(pressed, over, direction);
    // Detached controls need no retained animation or event subscriptions.
    for (const entry of active)
      if (!entry.element.isConnected) {
        entry.dispose();
        active.delete(entry);
      }
  }
  const over = (event: PointerEvent) => {
    const element = target(event);
    if (hovered === element) return;
    if (hovered) feedback(hovered, held === hovered, false);
    hovered = element;
    if (element) {
      const rect = element.getBoundingClientRect();
      const direction = Math.max(
        -2,
        Math.min(2, (event.clientX - rect.left - rect.width / 2) / 12),
      );
      feedback(element, held === element, true, direction);
    }
  };
  const leave = (event: PointerEvent) => {
    if (hovered && !hovered.contains(event.relatedTarget as Node | null)) {
      feedback(hovered, held === hovered, false);
      hovered = null;
    }
  };
  const press = (event: PointerEvent) => {
    if (event.button !== 0) return;
    held = target(event);
    if (held) feedback(held, true, true);
  };
  const release = () => {
    if (held) feedback(held, false, hovered === held);
    held = null;
  };
  const activate = (event: MouseEvent) => {
    if (event.detail !== 0) return;
    const element = target(event);
    if (element && held !== element) {
      feedback(element, true, false);
      queueMicrotask(() => feedback(element, false, false));
    }
  };
  const keyDown = (event: KeyboardEvent) => {
    if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat) return;
    held = target(event);
    if (held) feedback(held, true, false);
  };
  const keyUp = (event: KeyboardEvent) => {
    if (event.key === ' ' || event.key === 'Enter') release();
  };
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reset = () => {
    if (speedMultiplier() === 0) active.forEach((entry) => entry.reset());
  };
  root.addEventListener('pointerover', over, true);
  root.addEventListener('pointerout', leave, true);
  root.addEventListener('pointerdown', press, true);
  root.addEventListener('pointerup', release, true);
  root.addEventListener('pointercancel', release, true);
  root.addEventListener('click', activate, true);
  root.addEventListener('keydown', keyDown, true);
  root.addEventListener('keyup', keyUp, true);
  media.addEventListener('change', reset);
  return () => {
    active.forEach((entry) => entry.dispose());
    active.clear();
    root.removeEventListener('pointerover', over, true);
    root.removeEventListener('pointerout', leave, true);
    root.removeEventListener('pointerdown', press, true);
    root.removeEventListener('pointerup', release, true);
    root.removeEventListener('pointercancel', release, true);
    root.removeEventListener('click', activate, true);
    root.removeEventListener('keydown', keyDown, true);
    root.removeEventListener('keyup', keyUp, true);
    media.removeEventListener('change', reset);
  };
}
