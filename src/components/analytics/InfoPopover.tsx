import type { ReactNode } from 'react';
import { InfoIcon } from '../ui/icons';

/** An info button whose popover holds the caveats and detail a section keeps off its face. */
export function InfoPopover({
  label = 'About these numbers',
  side = 'bottom',
  children,
}: {
  label?: string;
  /** Opens upwards where a clipping surface ends below the button. */
  side?: 'top' | 'bottom';
  children: ReactNode;
}) {
  return (
    <details className="relative">
      <summary
        aria-label={label}
        title={label}
        className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <InfoIcon width={18} height={18} />
      </summary>
      <div
        className={`absolute right-0 ${side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} z-20 w-[min(22rem,calc(100vw-5rem))] space-y-2 rounded-2xl border border-line bg-surface-raised p-4 text-xs text-ink-soft shadow-lg`}
      >
        {children}
      </div>
    </details>
  );
}
