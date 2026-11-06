import { animate } from 'motion/mini';
import { speedMultiplier } from '../../state/motionSpeed';
import { motionTransition } from './motion';

/** A quiet colour wash leaves native paint, content and hit areas in their owner's hands. */
export function createFeedbackSurface(element: HTMLElement, onDispose: () => void) {
  const layer = document.createElement('i');
  layer.setAttribute('aria-hidden', 'true');
  layer.className = 'flow-feedback-layer';
  let animation: ReturnType<typeof animate> | undefined;
  const originalPosition = element.style.position;
  let disposed = false;
  let pressed = false,
    over = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    animation?.stop();
    layer.remove();
    if (element.style.position === 'relative') {
      if (originalPosition) element.style.position = originalPosition;
      else element.style.removeProperty('position');
    }
    onDispose();
  };
  if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
  element.prepend(layer);
  layer.style.opacity = '0';
  return {
    element,
    dispose,
    retarget(nextPressed: boolean, nextOver: boolean) {
      if (disposed) return;
      pressed = nextPressed && element.dataset.flowFeedback !== 'hover';
      over = nextOver && element.dataset.flowFeedback !== 'press';
      // Native opacity keeps the wash moving while the action occupies the main
      // thread. Mini commits the presented style before retargeting this layer.
      animation = animate(
        layer,
        { opacity: pressed ? 0.09 : over ? 0.045 : 0 },
        {
          ...motionTransition('feedback', speedMultiplier()),
          onComplete: () => {
            if (!pressed && !over) dispose();
          },
        },
      );
    },
    reset() {
      if (disposed) return;
      animation?.stop();
      layer.style.opacity = String(pressed ? 0.09 : over ? 0.045 : 0);
      if (!pressed && !over) dispose();
    },
  };
}
