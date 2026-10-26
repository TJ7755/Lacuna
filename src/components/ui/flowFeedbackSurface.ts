import { animate, motionValue } from 'motion';
import { speedMultiplier } from '../../state/motionSpeed';
import { scaledSpring } from './motion';

/** A quiet inset shadow leaves native paint, content and hit areas in their owner's hands. */
export function createFeedbackSurface(element: HTMLElement, onDispose: () => void) {
  const layer = document.createElement('span');
  layer.setAttribute('aria-hidden', 'true');
  layer.className = 'flow-feedback-layer';
  const depth = motionValue(0);
  const originalPosition = element.style.position;
  let disposed = false;
  let pressed = false,
    over = false;
  const draw = () => {
    layer.style.opacity = String(depth.get());
  };
  const stop = depth.on('change', draw);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    depth.stop();
    stop();
    layer.remove();
    if (element.style.position === 'relative') {
      if (originalPosition) element.style.position = originalPosition;
      else element.style.removeProperty('position');
    }
    onDispose();
  };
  if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
  element.append(layer);
  draw();
  return {
    element,
    dispose,
    retarget(nextPressed: boolean, nextOver: boolean) {
      if (disposed) return;
      pressed = nextPressed && element.dataset.flowFeedback !== 'hover';
      over = nextOver && element.dataset.flowFeedback !== 'press';
      animate(depth, pressed ? 0.16 : over ? 0.045 : 0, {
        ...scaledSpring(speedMultiplier(), 580, 32),
        onComplete: () => {
          if (!pressed && !over) dispose();
        },
      });
    },
    reset() {
      depth.jump(pressed ? 0.16 : over ? 0.045 : 0);
      if (!pressed && !over) dispose();
    },
  };
}
