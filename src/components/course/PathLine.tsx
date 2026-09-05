// Curved ink strokes connect adjacent lesson stops. Completed stretches keep
// the existing amber progress cue; the curve itself never represents progress.
import { cn } from '../ui/cn';

const trails = [
  'M60 2 C61 16 106 13 103 30 C100 48 57 45 60 62',
  'M60 2 C59 14 18 17 24 34 C29 49 66 47 60 62',
  'M60 2 C79 12 91 22 78 34 C64 44 40 47 60 62',
] as const;

interface PathLineProps {
  completed?: boolean;
  orientation?: 'vertical' | 'horizontal';
  index?: number;
  className?: string;
}

export function PathLine({
  completed = false,
  orientation = 'vertical',
  index = 0,
  className,
}: PathLineProps) {
  const vertical = orientation === 'vertical';
  return (
    <svg
      data-path-connector
      aria-hidden="true"
      focusable="false"
      viewBox={vertical ? '0 0 120 64' : '0 0 64 120'}
      fill="none"
      className={cn(
        'pointer-events-none shrink-0 transition-colors duration-150',
        vertical ? 'h-16 w-30' : 'h-30 w-16',
        completed ? 'text-accent/60' : 'text-line-strong',
        className,
      )}
    >
      <path
        d={trails[index % trails.length]}
        transform={vertical ? undefined : 'translate(64 0) rotate(90)'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
