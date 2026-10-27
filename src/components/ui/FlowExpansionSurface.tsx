import { useLayoutEffect, useRef } from 'react';
import { expansionOutline, flowPath } from './flowContour';

/** The visible paint owner also supplies the opaque Study launch appearance. */
export function flowSurfaceColour(element: HTMLElement): string {
  const paint = element.querySelector('[data-flow-surface-paint]');
  return paint ? getComputedStyle(paint).fill : getComputedStyle(element).backgroundColor;
}

/** One opaque continuous-corner surface follows the existing source-origin expansion. */
export function FlowExpansionSurface({
  triggerWidth,
  triggerHeight,
  prominent = false,
}: {
  triggerWidth: number;
  triggerHeight: number;
  prominent?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  useLayoutEffect(() => {
    const element = svg.current;
    const paint = path.current;
    const shell = element?.parentElement;
    if (!element || !paint || !shell) return;
    const content = shell.querySelector<HTMLElement>('[data-flow-expansion-content]');
    let width = triggerWidth,
      height = triggerHeight;
    const draw = () => {
      const outline = expansionOutline(width, height, triggerHeight);
      const d = flowPath(outline);
      element.setAttribute('viewBox', `-4 -4 ${width + 8} ${height + 8}`);
      paint.setAttribute('d', d);
      paint.setAttribute('stroke', 'hsl(var(--line))');
      paint.setAttribute('stroke-width', '1');
      if (content) {
        const local = outline.map((point) => ({
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
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    measure();
    return () => {
      observer.disconnect();
      content?.style.removeProperty('clip-path');
      shell.style.removeProperty('--flow-expansion-ink');
    };
  }, [triggerWidth, triggerHeight, prominent]);
  return (
    <svg ref={svg} aria-hidden="true" className="flow-expansion-paint">
      <path ref={path} data-flow-surface-paint />
    </svg>
  );
}
