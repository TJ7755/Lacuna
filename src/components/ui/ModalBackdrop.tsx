import type { ComponentProps } from 'react';
import { cn } from './cn';

type Props = Omit<ComponentProps<'div'>, 'children'> & {
  shade?: 30 | 40 | 45 | 50;
};

const SHADES = {
  30: 'bg-black/30',
  40: 'bg-black/40',
  45: 'bg-black/45',
  50: 'bg-black/50',
} as const;

export function ModalBackdrop({ shade = 50, className, ...props }: Props) {
  return (
    <div
      {...props}
      data-modal-backdrop=""
      aria-hidden="true"
      className={cn('absolute inset-0 backdrop-blur-sm', SHADES[shade], className)}
    />
  );
}
