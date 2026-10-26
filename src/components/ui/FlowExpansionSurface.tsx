import { useLayoutEffect, useRef } from 'react';
import { animate, motionValue } from 'motion';
import { expansionOutline, deformFlow, flowPath, type FlowFeedback } from './flowContour';
import { scaledSpring } from './motion';

export const FLOW_FEEDBACK_EVENT = 'lacuna:flow-feedback';
export interface FlowFeedbackInput {
  pressed: boolean;
  over: boolean;
  x: number;
}

/** The visible paint owner also supplies the opaque Study launch appearance. */
export function flowSurfaceColour(element: HTMLElement): string {
  const paint = element.querySelector('[data-flow-surface-paint]');
  return paint ? getComputedStyle(paint).fill : getComputedStyle(element).backgroundColor;
}

/** One connected continuous-corner contour, including the returning source lobe. */
export function FlowExpansionSurface({
  triggerWidth,
  triggerHeight,
  multiplier,
  prominent = false,
  align = 'end',
}: {
  open: boolean;
  triggerWidth: number;
  triggerHeight: number;
  multiplier: number;
  prominent?: boolean;
  align?: 'start' | 'end';
}) {
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  useLayoutEffect(() => {
    const element = svg.current;
    const paint = path.current;
    const shell = element?.parentElement;
    if (!element || !paint || !shell) return;
    const content = shell.querySelector<HTMLElement>('[data-flow-expansion-content]');
    const pressure = motionValue(0);
    const x = motionValue(triggerWidth / 2);
    let width = triggerWidth,
      height = triggerHeight;
    const draw = () => {
      const feedback: FlowFeedback = {
        pressure: pressure.get(),
        x: (align === 'end' ? width - triggerWidth : 0) + x.get(),
      };
      const outline = expansionOutline(width, height, triggerWidth, triggerHeight, align);
      const d = flowPath(deformFlow(outline, width, height, feedback, triggerHeight));
      element.setAttribute('viewBox', `-4 -4 ${width + 8} ${height + 8}`);
      paint.setAttribute('d', d);
      paint.setAttribute('stroke', 'hsl(var(--line))');
      paint.setAttribute('stroke-width', '1');
      if (content) {
        const local = deformFlow(outline, width, height, feedback, triggerHeight).map((point) => ({
          x: point.x - content.offsetLeft - shell.clientLeft,
          y: point.y - content.offsetTop - shell.clientTop,
        }));
        content.style.clipPath = `path('${flowPath(local)}')`;
      }
      // Colour changes only as the actual returning silhouette reaches its source.
      const closed = Math.max(
        0,
        1 - Math.max((width - triggerWidth) / 32, (height - triggerHeight) / 20),
      );
      const mix = Math.min(100, closed * 100);
      paint.style.fill = prominent
        ? `color-mix(in srgb, hsl(var(--accent)) ${mix}%, hsl(var(--surface-raised)))`
        : 'hsl(var(--surface-raised))';
      shell.style.setProperty(
        '--flow-expansion-ink',
        `color-mix(in srgb, hsl(var(--accent-fg)) ${mix}%, hsl(var(--ink)))`,
      );
    };
    const measure = () => {
      width = shell.offsetWidth;
      height = shell.offsetHeight;
      element.style.cssText = `left:${-4 - shell.clientLeft}px;top:${-4 - shell.clientTop}px;width:${width + 8}px;height:${height + 8}px`;
      draw();
    };
    const feedback = (event: Event) => {
      const input = (event as CustomEvent<FlowFeedbackInput>).detail;
      animate(
        pressure,
        multiplier > 0 ? (input.pressed ? 1 : input.over ? 0.5 : 0) : 0,
        scaledSpring(multiplier, 580, 27),
      );
      animate(x, input.x, scaledSpring(multiplier, 500, 28));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    const stops = [pressure.on('change', draw), x.on('change', draw)];
    shell.addEventListener(FLOW_FEEDBACK_EVENT, feedback);
    measure();
    return () => {
      pressure.stop();
      x.stop();
      stops.forEach((stop) => stop());
      observer.disconnect();
      shell.removeEventListener(FLOW_FEEDBACK_EVENT, feedback);
      content?.style.removeProperty('clip-path');
      shell.style.removeProperty('--flow-expansion-ink');
    };
  }, [triggerWidth, triggerHeight, multiplier, prominent, align]);
  return (
    <svg ref={svg} aria-hidden="true" className="flow-expansion-paint">
      <path ref={path} data-flow-surface-paint />
    </svg>
  );
}
