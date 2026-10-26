import { speedMultiplier } from '../../state/motionSpeed';
import { createFeedbackSurface } from './flowFeedbackSurface';

const PRESSABLE =
  'button:not(:disabled), a[href], [role="button"], [role="link"], ' +
  '[role="menuitem"], [role="tab"], [role="option"], [role="switch"], summary, label:has(input[type="radio"]:not(:disabled))';

/** One input owner; surface owners deform paint independently of content and native targets. */
export function installPressFeedback(root: Document = document): () => void {
  type Surface = ReturnType<typeof createFeedbackSurface>;
  const surfaces = new Map<HTMLElement, Surface>();
  let held: HTMLElement | null = null,
    hovered: HTMLElement | null = null;
  const target = (event: Event) => {
    const element =
      event.target instanceof Element ? event.target.closest<HTMLElement>(PRESSABLE) : null;
    return element &&
      !element.closest('[inert], [data-flow-paint-probe]') &&
      element.getAttribute('aria-disabled') !== 'true' &&
      (element.getAttribute('data-press') !== 'none' || element.hasAttribute('data-flow-feedback'))
      ? element
      : null;
  };
  const feedback = (element: HTMLElement, pressed: boolean, over: boolean, x?: number) => {
    if (!element.isConnected) return;
    let surface = surfaces.get(element);
    if (!surface) {
      surface = createFeedbackSurface(element, () => surfaces.delete(element));
      surfaces.set(element, surface);
    }
    surface.retarget(pressed, over, x);
  };
  const over = (event: PointerEvent) => {
    const element = target(event);
    if (hovered === element) return;
    if (hovered) feedback(hovered, held === hovered, false);
    hovered = element;
    if (element) feedback(element, held === element, true, event.clientX);
  };
  const leave = (event: PointerEvent) => {
    if (hovered && !hovered.contains(event.relatedTarget as Node | null)) {
      feedback(hovered, held === hovered, false, event.clientX);
      hovered = null;
    }
  };
  const press = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (held) feedback(held, false, false);
    held = target(event);
    if (held) feedback(held, true, true, event.clientX);
  };
  const release = () => {
    if (held) feedback(held, false, hovered === held);
    held = null;
  };
  const cancel = () => {
    for (const element of [held, hovered]) if (element) feedback(element, false, false);
    held = hovered = null;
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
  const focusOut = (event: FocusEvent) => {
    if (held && !held.contains(event.relatedTarget as Node | null)) release();
  };
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reset = () => {
    if (speedMultiplier() === 0) surfaces.forEach((surface) => surface.reset());
  };
  // Detached surfaces are disposed without waiting for another pointer event.
  const observer = new MutationObserver((records) => {
    for (const [element, surface] of surfaces) {
      if (!element.isConnected || element.matches(':disabled') || element.closest('[inert]')) {
        surface.dispose();
        if (held === element) held = null;
        if (hovered === element) hovered = null;
      } else if (
        records.some(
          (record) =>
            record.type === 'attributes' &&
            (record.target === element ||
              (record.target instanceof Element && record.target.contains(element))),
        )
      )
        surface.refresh();
    }
  });
  observer.observe(root.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-pressed', 'aria-checked', 'disabled', 'data-state'],
  });
  root.addEventListener('pointerover', over, true);
  root.addEventListener('pointerout', leave, true);
  root.addEventListener('pointerdown', press, true);
  root.addEventListener('pointerup', release, true);
  root.addEventListener('pointercancel', cancel, true);
  root.addEventListener('dragstart', cancel, true);
  root.addEventListener('click', activate, true);
  root.addEventListener('keydown', keyDown, true);
  root.addEventListener('keyup', keyUp, true);
  root.addEventListener('focusout', focusOut, true);
  window.addEventListener('blur', cancel);
  media.addEventListener('change', reset);
  return () => {
    observer.disconnect();
    surfaces.forEach((surface) => surface.dispose());
    surfaces.clear();
    held = hovered = null;
    root.removeEventListener('pointerover', over, true);
    root.removeEventListener('pointerout', leave, true);
    root.removeEventListener('pointerdown', press, true);
    root.removeEventListener('pointerup', release, true);
    root.removeEventListener('pointercancel', cancel, true);
    root.removeEventListener('dragstart', cancel, true);
    root.removeEventListener('click', activate, true);
    root.removeEventListener('keydown', keyDown, true);
    root.removeEventListener('keyup', keyUp, true);
    root.removeEventListener('focusout', focusOut, true);
    window.removeEventListener('blur', cancel);
    media.removeEventListener('change', reset);
  };
}
