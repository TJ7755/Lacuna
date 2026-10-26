import { useId } from 'react';
import { m as motion } from 'motion/react';
import { expandingActionSpring } from './motion';

/** A local opaque lobe joins the growing body; readable content sits above the filter. */
export function FlowExpansionSurface({
  open,
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
  const filter = useId();
  const transition = expandingActionSpring(multiplier);
  return (
    <svg
      aria-hidden="true"
      className="flow-expansion-paint pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      style={{ color: 'hsl(var(--surface-raised))' }}
    >
      <defs>
        <filter
          id={filter}
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="5" />
          <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
        </filter>
      </defs>
      <g fill="currentColor" filter={multiplier > 0 ? `url(#${filter})` : undefined}>
        <motion.rect
          initial={multiplier > 0 ? { y: triggerHeight + 14 } : false}
          x="0"
          width="100%"
          height="100%"
          rx="24"
          animate={{ y: open ? 0 : triggerHeight + 14 }}
          transition={transition}
        />
        <svg x={align === 'end' ? '100%' : 0} overflow="visible">
          <rect
            data-flow-trigger-paint
            fill={prominent && !open ? 'hsl(var(--accent))' : 'currentColor'}
            x={align === 'end' ? -triggerWidth : 0}
            y="0"
            width={triggerWidth}
            height={triggerHeight}
            rx={triggerHeight / 2}
          />
          <motion.ellipse
            initial={false}
            cx={align === 'end' ? -triggerWidth / 2 : triggerWidth / 2}
            cy={triggerHeight}
            rx={triggerWidth * 0.22}
            animate={{ ry: open ? triggerHeight * 1.3 : 0 }}
            transition={transition}
          />
        </svg>
      </g>
    </svg>
  );
}
