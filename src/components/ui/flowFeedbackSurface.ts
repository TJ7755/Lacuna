import { animate, motionValue } from 'motion';
import { speedMultiplier } from '../../state/motionSpeed';
import { scaledSpring } from './motion';
import { deformFlow, flowOutline, flowPath } from './flowContour';
import { intendedFlowPaint, restoreFlowPaint } from './flowPaint';
import { FLOW_FEEDBACK_EVENT } from './FlowExpansionSurface';

const SVG = 'http://www.w3.org/2000/svg';

/** A disposable, owned decorative child. Existing pseudo-elements remain native targets. */
export function createFeedbackSurface(element: HTMLElement, onDispose: () => void) {
  const expansion = element.hasAttribute('data-flow-trigger')
    ? element.closest<HTMLElement>('.flow-expansion')
    : null;
  const svg = document.createElementNS(SVG, 'svg');
  const path = document.createElementNS(SVG, 'path');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('flow-feedback-layer');
  svg.append(path);
  const pressure = motionValue(0),
    point = motionValue(0);
  const originalPosition = element.style.position;
  let rect = element.getBoundingClientRect();
  let width = rect.width,
    height = rect.height;
  let paint = intendedFlowPaint(element);
  let lastX = rect.width / 2;
  let disposed = false;
  let pressed = false,
    over = false;

  const draw = () => {
    if (disposed || expansion) return;
    const radius = paint.radius > 0 ? Math.min(paint.radius, height / 2, width / 2) : height / 2;
    const outline = flowOutline(width, height, radius, radius >= height / 2 ? 2 : 4);
    path.setAttribute(
      'd',
      flowPath(deformFlow(outline, width, height, { pressure: pressure.get(), x: point.get() })),
    );
  };
  const refresh = () => {
    if (disposed || expansion) return;
    paint = intendedFlowPaint(element);
    path.setAttribute('fill', paint.fill);
    path.setAttribute('stroke', paint.borderWidth > 0 ? paint.border : 'none');
    path.setAttribute('stroke-width', String(paint.borderWidth));
    measure();
  };
  const measure = () => {
    if (disposed || expansion) return;
    rect = element.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    // A wide transparent navigation target gets a local patch, not a row-sized slab.
    if (paint.transparent && width > 260) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let textWidth = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        textWidth += range.getBoundingClientRect().width;
      }
      width = Math.min(width, Math.max(44, Math.min(260, textWidth + 24)));
    }
    const style = getComputedStyle(element);
    svg.style.cssText = `position:absolute;pointer-events:none;left:${-4 - (parseFloat(style.borderLeftWidth) || 0)}px;top:${-4 - (parseFloat(style.borderTopWidth) || 0)}px;width:${width + 8}px;height:${height + 8}px;`;
    svg.setAttribute('viewBox', `-4 -4 ${width + 8} ${height + 8}`);
    draw();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    pressure.stop();
    point.stop();
    stops.forEach((stop) => stop());
    observer?.disconnect();
    if (expansion)
      expansion.dispatchEvent(
        new CustomEvent(FLOW_FEEDBACK_EVENT, {
          detail: { pressed: false, over: false, x: rect.width / 2 },
        }),
      );
    else {
      restoreFlowPaint(element);
      svg.remove();
      if (element.style.position === 'relative' && !originalPosition)
        element.style.removeProperty('position');
      else if (element.style.position === 'relative' && originalPosition)
        element.style.position = originalPosition;
    }
    onDispose();
  };
  const stops = [pressure.on('change', draw), point.on('change', draw)];
  const observer =
    typeof ResizeObserver === 'undefined' || expansion ? null : new ResizeObserver(measure);
  if (!expansion) {
    if (getComputedStyle(element).position === 'static') element.style.position = 'relative';
    element.classList.add('flow-feedback');
    element.prepend(svg);
    observer?.observe(element);
    refresh();
  }
  return {
    element,
    refresh,
    dispose,
    retarget(nextPressed: boolean, nextOver: boolean, clientX?: number) {
      if (disposed) return;
      pressed = nextPressed && element.dataset.flowFeedback !== 'hover';
      over = nextOver && element.dataset.flowFeedback !== 'press';
      rect = element.getBoundingClientRect();
      if (clientX !== undefined) lastX = clientX - rect.left;
      const x = lastX;
      if (expansion) {
        expansion.dispatchEvent(
          new CustomEvent(FLOW_FEEDBACK_EVENT, { detail: { pressed, over, x } }),
        );
        if (!pressed && !over) dispose();
        return;
      }
      const multiplier = speedMultiplier();
      animate(point, Math.min(width - 12, Math.max(12, x)), scaledSpring(multiplier, 500, 28));
      animate(pressure, multiplier > 0 ? (pressed ? 1 : over ? 0.5 : 0) : 0, {
        ...scaledSpring(multiplier, 580, 27),
        onComplete: () => {
          if (!pressed && !over) dispose();
        },
      });
    },
    reset() {
      pressure.jump(0);
      point.jump(width / 2);
      if (!pressed && !over) dispose();
    },
  };
}
